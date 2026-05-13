# Arcade Studio

Frontend multi-game arcade with a small FastAPI backend for:

- email/password login
- Google OAuth login
- per-user game history
- per-game high scores

## Run Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload
```

Open `http://127.0.0.1:8000`.

## OAuth

Copy `backend/.env.example` to `backend/.env` and fill in the Google credentials.
Google login will only work when those keys are configured.
Use this redirect URL in the Google console:

- `http://127.0.0.1:8000/api/auth/google/callback`
