from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import secrets
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

from authlib.integrations.starlette_client import OAuth
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr
from starlette.middleware.sessions import SessionMiddleware
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "backend" / "arcade.db"
STATIC_DIR = ROOT
load_dotenv(ROOT / "backend" / ".env")
SESSION_SECRET = os.getenv("SESSION_SECRET", "arcade-studio-dev-secret-change-me")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:8000")


app = FastAPI(title="Arcade Studio API")
app.add_middleware(SessionMiddleware, secret_key=SESSION_SECRET, same_site="lax")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:8000", "http://127.0.0.1:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/css", StaticFiles(directory=ROOT / "css"), name="css")
app.mount("/js", StaticFiles(directory=ROOT / "js"), name="js")
app.mount("/assests", StaticFiles(directory=ROOT / "assests"), name="assests")

oauth = OAuth()
oauth.register(
    name="google",
    client_id=os.getenv("GOOGLE_CLIENT_ID"),
    client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


class RegisterInput(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginInput(BaseModel):
    name: str | None = None
    email: EmailStr
    password: str


class GameResultInput(BaseModel):
    game_key: str
    score: int
    details: dict[str, Any] | None = None


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt_hex, digest_hex = stored.split("$", 1)
    except ValueError:
        return False
    salt = bytes.fromhex(salt_hex)
    expected = bytes.fromhex(digest_hex)
    actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 120_000)
    return hmac.compare_digest(actual, expected)


@contextmanager
def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT,
                oauth_provider TEXT,
                oauth_subject TEXT,
                avatar_url TEXT,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS game_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                game_key TEXT NOT NULL,
                score INTEGER NOT NULL,
                details_json TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY(user_id) REFERENCES users(id)
            );

            CREATE TABLE IF NOT EXISTS user_game_best (
                user_id INTEGER NOT NULL,
                game_key TEXT NOT NULL,
                best_score INTEGER NOT NULL,
                last_score INTEGER NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(user_id, game_key),
                FOREIGN KEY(user_id) REFERENCES users(id)
            );
            """
        )


def get_user_by_id(user_id: int) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def get_user_by_email(email: str) -> dict[str, Any] | None:
    with db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower(),)).fetchone()
    return dict(row) if row else None


def get_or_create_oauth_user(provider: str, subject: str, email: str | None, name: str, avatar_url: str | None) -> dict[str, Any]:
    with db() as conn:
        row = conn.execute(
            """
            SELECT * FROM users
            WHERE oauth_provider = ? AND oauth_subject = ?
            """,
            (provider, subject),
        ).fetchone()
        if row:
            conn.execute(
                """
                UPDATE users
                SET name = ?, email = COALESCE(?, email), avatar_url = ?
                WHERE id = ?
                """,
                (name, email.lower() if email else None, avatar_url, row["id"]),
            )
            updated = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
            return dict(updated)

        existing = None
        if email:
            existing = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower(),)).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE users
                SET oauth_provider = ?, oauth_subject = ?, avatar_url = ?, name = ?
                WHERE id = ?
                """,
                (provider, subject, avatar_url, name, existing["id"]),
            )
            updated = conn.execute("SELECT * FROM users WHERE id = ?", (existing["id"],)).fetchone()
            return dict(updated)

        cursor = conn.execute(
            """
            INSERT INTO users (name, email, password_hash, oauth_provider, oauth_subject, avatar_url, created_at)
            VALUES (?, ?, NULL, ?, ?, ?, ?)
            """,
            (name, email.lower() if email else f"{provider}:{subject}", provider, subject, avatar_url, now_iso()),
        )
        created = conn.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
        return dict(created)


def set_session_user(request: Request, user: dict[str, Any]) -> None:
    request.session["user"] = user


def clear_session_user(request: Request) -> None:
    request.session.pop("user", None)
    request.session.pop("user_id", None)


def require_user(request: Request) -> dict[str, Any]:
    session_user = request.session.get("user")
    if session_user:
        return session_user
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = get_user_by_id(int(user_id))
    if not user:
        clear_session_user(request)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def user_payload(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": user.get("id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "avatar_url": user.get("avatar_url"),
        "oauth_provider": user.get("oauth_provider"),
        "created_at": user.get("created_at"),
    }


def oauth_is_configured() -> bool:
    return bool(os.getenv("GOOGLE_CLIENT_ID") and os.getenv("GOOGLE_CLIENT_SECRET"))


def frontend_redirect_url(**params: str) -> str:
    if not params:
        return FRONTEND_URL
    return f"{FRONTEND_URL}?{urlencode(params)}"


def build_session_profile(
    *,
    name: str,
    email: str,
    oauth_provider: str | None = None,
    avatar_url: str | None = None,
) -> dict[str, Any]:
    return {
        "id": None,
        "name": name.strip() or "Player",
        "email": email.lower(),
        "avatar_url": avatar_url,
        "oauth_provider": oauth_provider,
        "created_at": now_iso(),
    }


@app.on_event("startup")
def startup() -> None:
    init_db()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(ROOT / "index.html")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/register")
def register(payload: RegisterInput, request: Request) -> dict[str, Any]:
    user = build_session_profile(name=payload.name, email=str(payload.email))
    set_session_user(request, user)
    return {"user": user_payload(user), "high_scores": []}


@app.post("/api/auth/login")
def login(payload: LoginInput, request: Request) -> dict[str, Any]:
    fallback_name = str(payload.email).split("@", 1)[0].replace(".", " ").title()
    user = build_session_profile(
        name=payload.name or fallback_name,
        email=str(payload.email),
    )
    set_session_user(request, user)
    return {"user": user_payload(user), "high_scores": []}


@app.post("/api/auth/logout")
def logout(request: Request) -> dict[str, str]:
    clear_session_user(request)
    return {"message": "Logged out"}


@app.get("/api/auth/me")
def me(request: Request) -> dict[str, Any]:
    user = require_user(request)
    if user.get("id") is None:
        return {"user": user_payload(user), "high_scores": []}
    return {"user": user_payload(user), "high_scores": get_high_scores_for_user(user["id"])}


@app.get("/api/auth/providers")
def auth_providers() -> dict[str, Any]:
    return {
        "providers": {
            "google": {
                "available": oauth_is_configured(),
            }
        }
    }


@app.get("/api/auth/google/login")
async def oauth_login(request: Request):
    if not oauth_is_configured():
        raise HTTPException(status_code=501, detail="Google OAuth is not configured")
    client = oauth.create_client("google")
    if client is None:
        raise HTTPException(status_code=500, detail="OAuth client not configured")
    request.session["oauth_popup"] = request.query_params.get("popup") == "1"
    redirect_uri = request.url_for("oauth_callback")
    return await client.authorize_redirect(request, redirect_uri)


@app.get("/api/auth/google/callback", name="oauth_callback")
async def oauth_callback(request: Request):
    if not oauth_is_configured():
        raise HTTPException(status_code=501, detail="Google OAuth is not configured")
    client = oauth.create_client("google")
    if client is None:
        raise HTTPException(status_code=500, detail="OAuth client not configured")
    popup_mode = bool(request.session.pop("oauth_popup", False))

    try:
        token = await client.authorize_access_token(request)
        profile = await client.parse_id_token(request, token)
    except Exception as exc:
        if popup_mode:
            return HTMLResponse(
                f"""
                <!DOCTYPE html>
                <html><body><script>
                if (window.opener) {{
                  window.opener.postMessage({{"type":"google-auth","success":false,"message":{json.dumps(str(exc) or "Google sign-in failed")}}}, window.location.origin);
                }}
                window.close();
                </script></body></html>
                """
            )
        return RedirectResponse(url=frontend_redirect_url(auth_error="Google sign-in failed"), status_code=302)

    subject = str(profile.get("sub") or profile.get("email"))
    email = profile.get("email")
    name = profile.get("name") or "Player"
    avatar_url = profile.get("picture")
    user = build_session_profile(
        name=name,
        email=email or f"google:{subject}@local",
        oauth_provider="google",
        avatar_url=avatar_url,
    )
    set_session_user(request, user)
    if popup_mode:
        return HTMLResponse(
            f"""
            <!DOCTYPE html>
            <html><body><script>
            if (window.opener) {{
              window.opener.postMessage({{"type":"google-auth","success":true}}, window.location.origin);
            }}
            window.close();
            </script></body></html>
            """
        )
    return RedirectResponse(url=frontend_redirect_url(auth="google"), status_code=302)


@app.post("/api/games/result")
def submit_game_result(payload: GameResultInput, request: Request) -> dict[str, Any]:
    user = require_user(request)
    if user.get("id") is None:
        return {"ok": True, "best_scores": []}
    with db() as conn:
        conn.execute(
            """
            INSERT INTO game_sessions (user_id, game_key, score, details_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                payload.game_key,
                int(payload.score),
                json.dumps(payload.details or {}),
                now_iso(),
            ),
        )
        conn.execute(
            """
            INSERT INTO user_game_best (user_id, game_key, best_score, last_score, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, game_key) DO UPDATE SET
                last_score = excluded.last_score,
                best_score = CASE
                    WHEN excluded.best_score > user_game_best.best_score THEN excluded.best_score
                    ELSE user_game_best.best_score
                END,
                updated_at = excluded.updated_at
            """,
            (user["id"], payload.game_key, int(payload.score), int(payload.score), now_iso()),
        )

    return {"ok": True, "best_scores": get_high_scores_for_user(user["id"])}


def get_high_scores_for_user(user_id: int) -> list[dict[str, Any]]:
    with db() as conn:
        rows = conn.execute(
            """
            SELECT game_key, best_score, last_score, updated_at
            FROM user_game_best
            WHERE user_id = ?
            ORDER BY game_key
            """,
            (user_id,),
        ).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/games/history")
def game_history(request: Request) -> dict[str, Any]:
    user = require_user(request)
    if user.get("id") is None:
        return {"history": [], "high_scores": []}
    with db() as conn:
        rows = conn.execute(
            """
            SELECT game_key, score, details_json, created_at
            FROM game_sessions
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 100
            """,
            (user["id"],),
        ).fetchall()
    return {"history": [dict(row) for row in rows], "high_scores": get_high_scores_for_user(user["id"])}


@app.exception_handler(HTTPException)
def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
