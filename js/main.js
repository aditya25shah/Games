const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const gameList = document.getElementById("gameList");
const activeGameName = document.getElementById("activeGameName");
const activeGameDescription = document.getElementById("activeGameDescription");
const activeGameTag = document.getElementById("activeGameTag");
const activeGameDifficulty = document.getElementById("activeGameDifficulty");
const activeGameMode = document.getElementById("activeGameMode");
const controlsList = document.getElementById("controlsList");
const statusText = document.getElementById("statusText");
const canvasShell = document.getElementById("canvasShell");
const canvasStateLabel = document.getElementById("canvasStateLabel");
const canvasOverlay = document.getElementById("canvasOverlay");
const hudScore = document.getElementById("hudScore");
const hudLevel = document.getElementById("hudLevel");
const hudLines = document.getElementById("hudLines");
const nextPiecePreview = document.getElementById("nextPiecePreview");

const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const resetButton = document.getElementById("resetButton");
const accountToggle = document.getElementById("accountToggle");
const accountTitle = document.getElementById("accountTitle");
const authState = document.getElementById("authState");
const authFlyout = document.getElementById("authFlyout");
const authSummary = document.getElementById("authSummary");
const authForm = document.getElementById("authForm");
const authName = document.getElementById("authName");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const googleAuth = document.getElementById("googleAuth");
const oauthStatus = document.getElementById("oauthStatus");
const oauthHelp = document.getElementById("oauthHelp");
const logoutButton = document.getElementById("logoutButton");

const CANVAS_WIDTH = canvas.width;
const CANVAS_HEIGHT = canvas.height;

let selectedGameId = "tetris";
let activeGame = null;
let lastFrame = 0;
let currentUser = null;
let scoreSubmittedForRound = false;
let providerState = { google: { available: false } };
let authFlashMessage = "";
let googleAuthPopup = null;

const tetrisPalette = ["#4cc9f0", "#f72585", "#4361ee", "#f8961e", "#90be6d", "#577590", "#f9c74f"];
const tetrisShapes = [
  [[1, 1, 1, 1]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1]],
  [[1, 1, 0], [0, 1, 1]],
  [[0, 1, 1], [1, 1, 0]],
  [[1, 0, 0], [1, 1, 1]],
  [[0, 0, 1], [1, 1, 1]]
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomInt(max) {
  return Math.floor(Math.random() * max);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(path, {
    credentials: "include",
    headers,
    ...options
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.detail || "Request failed");
  }

  return payload;
}

function getInitials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("") || "GS";
}

function formatGameKey(gameKey) {
  return games[gameKey]?.name || gameKey.charAt(0).toUpperCase() + gameKey.slice(1);
}

function formatSessionTimestamp(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Saved recently";
  }
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function closeAuthFlyout() {
  accountToggle.parentElement.classList.remove("open");
}

function setAuthMessage(message) {
  authSummary.textContent = message;
}

function renderProviderState() {
  const googleAvailable = Boolean(providerState.google?.available);
  googleAuth.disabled = !googleAvailable;
  oauthStatus.textContent = googleAvailable ? "Google ready" : "Google unavailable";
  oauthHelp.textContent = googleAvailable
    ? "Use Google for one-click account setup and synced score storage."
    : "Restart the backend after updating backend/.env so Google credentials are reloaded.";
}

function renderAuth(user, highScores = []) {
  currentUser = user;
  if (!user) {
    accountTitle.textContent = "Guest Session";
    authState.textContent = "Sign in";
    setAuthMessage(authFlashMessage || "Log in to save game history and track your best score in every game.");
    return;
  }

  accountTitle.textContent = user.name;
  authState.textContent = user.oauth_provider === "google" ? "Google" : "Email";
  const bestScores = highScores.length
    ? highScores.map(entry => `${formatGameKey(entry.game_key)} ${entry.best_score}`).join(" | ")
    : "No scores saved yet.";
  setAuthMessage(authFlashMessage || `${user.email}. ${bestScores}`);
}

async function refreshSession() {
  try {
    const data = await api("/api/auth/me", { method: "GET", headers: {} });
    renderAuth(data.user, data.high_scores || []);
  } catch {
    renderAuth(null);
  }
}

async function refreshProviders() {
  try {
    const data = await api("/api/auth/providers", { method: "GET", headers: {} });
    providerState = data.providers || providerState;
  } catch {
    providerState = { google: { available: false } };
  }
  renderProviderState();
}

function consumeAuthQueryState() {
  const params = new URLSearchParams(window.location.search);
  const success = params.get("auth");
  const error = params.get("auth_error");
  if (!success && !error) {
    return;
  }

  if (success === "google") {
    authFlashMessage = "Google sign-in complete. Your scores will now sync automatically.";
  }
  if (error) {
    authFlashMessage = decodeURIComponent(error);
  }

  params.delete("auth");
  params.delete("auth_error");
  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", nextUrl);
}

function fillRoundedRect(x, y, width, height, radius, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
  ctx.fill();
}

function drawStageFrame(title, accent) {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, "#1b252b");
  gradient.addColorStop(1, "#0d1318");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let x = 20; x < CANVAS_WIDTH; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_HEIGHT);
    ctx.stroke();
  }
  for (let y = 20; y < CANVAS_HEIGHT; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_WIDTH, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.font = "700 28px Georgia";
  ctx.fillText(title, 28, 42);
  ctx.fillStyle = accent;
  ctx.font = '600 13px "Aptos", sans-serif';
  ctx.fillText("Arcade Studio Session", 30, 66);
}

function drawOverlay(message, subMessage) {
  fillRoundedRect(140, 280, 360, 128, 24, "rgba(10,16,21,0.84)");
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.strokeRect(140, 280, 360, 128);
  ctx.fillStyle = "#f7f3ec";
  ctx.font = "700 32px Georgia";
  ctx.textAlign = "center";
  ctx.fillText(message, CANVAS_WIDTH / 2, 330);
  ctx.font = '500 15px "Aptos", sans-serif';
  ctx.fillStyle = "rgba(247,243,236,0.72)";
  ctx.fillText(subMessage, CANVAS_WIDTH / 2, 365);
  ctx.textAlign = "start";
}

function createTetrisGame() {
  const cols = 10;
  const rows = 20;
  const cell = 28;
  const offsetX = 180;
  const offsetY = 92;

  let board = [];
  let piece = null;
  let nextPiece = null;
  let dropTimer = 0;
  let score = 0;
  let lines = 0;
  let level = 1;
  let ended = false;

  function createBoard() {
    return Array.from({ length: rows }, () => Array(cols).fill(0));
  }

  function rotate(shape) {
    return shape[0].map((_, index) => shape.map(row => row[index]).reverse());
  }

  function spawnPiece() {
    const index = randomInt(tetrisShapes.length);
    const shape = tetrisShapes[index].map(row => [...row]);
    return {
      color: tetrisPalette[index],
      shape,
      x: Math.floor(cols / 2) - Math.ceil(shape[0].length / 2),
      y: 0
    };
  }

  function collides(nextPiece = piece) {
    return nextPiece.shape.some((row, y) =>
      row.some((value, x) => {
        if (!value) {
          return false;
        }
        const boardX = nextPiece.x + x;
        const boardY = nextPiece.y + y;
        return boardX < 0 || boardX >= cols || boardY >= rows || (boardY >= 0 && board[boardY][boardX]);
      })
    );
  }

  function mergePiece() {
    piece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          board[piece.y + y][piece.x + x] = piece.color;
        }
      });
    });
  }

  function clearLines() {
    let cleared = 0;
    for (let y = rows - 1; y >= 0; y -= 1) {
      if (board[y].every(Boolean)) {
        board.splice(y, 1);
        board.unshift(Array(cols).fill(0));
        cleared += 1;
        y += 1;
      }
    }
    if (cleared > 0) {
      lines += cleared;
      score += cleared * 120 * level;
      level = 1 + Math.floor(lines / 6);
    }
  }

  function drop() {
    piece.y += 1;
    if (collides()) {
      piece.y -= 1;
      mergePiece();
      clearLines();
      piece = nextPiece;
      nextPiece = spawnPiece();
      if (collides()) {
        ended = true;
      }
    }
  }

  function drawBoard() {
    fillRoundedRect(offsetX - 18, offsetY - 18, cols * cell + 36, rows * cell + 36, 26, "rgba(255,255,255,0.04)");
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < cols; x += 1) {
        const px = offsetX + x * cell;
        const py = offsetY + y * cell;
        ctx.strokeStyle = "rgba(255,255,255,0.06)";
        ctx.strokeRect(px, py, cell, cell);
        if (board[y][x]) {
          fillRoundedRect(px + 2, py + 2, cell - 4, cell - 4, 8, board[y][x]);
        }
      }
    }
  }

  function drawPieceState(currentPiece) {
    currentPiece.shape.forEach((row, y) => {
      row.forEach((value, x) => {
        if (value) {
          const px = offsetX + (currentPiece.x + x) * cell;
          const py = offsetY + (currentPiece.y + y) * cell;
          fillRoundedRect(px + 2, py + 2, cell - 4, cell - 4, 8, currentPiece.color);
        }
      });
    });
  }

  return {
    start() {
      this.reset();
    },
    reset() {
      board = createBoard();
      piece = spawnPiece();
      nextPiece = spawnPiece();
      dropTimer = 0;
      score = 0;
      lines = 0;
      level = 1;
      ended = false;
    },
    update(delta, isRunning) {
      if (!isRunning || ended) {
        return;
      }
      dropTimer += delta;
      const interval = Math.max(120, 620 - (level - 1) * 50);
      if (dropTimer >= interval) {
        drop();
        dropTimer = 0;
      }
    },
    render(isRunning, isPaused) {
      drawStageFrame("Tetris", "#4cc9f0");
      drawBoard();
      if (piece) {
        drawPieceState(piece);
      }
      if (ended) {
        drawOverlay("Game Over", "Press Reset to start a fresh board.");
      } else if (!isRunning) {
        drawOverlay("Ready", "Press Start to begin Tetris.");
      } else if (isPaused) {
        drawOverlay("Paused", "Press Start to continue the session.");
      }
    },
    getResult() {
      return { score };
    },
    onKeyDown(key, isRunning) {
      if (!isRunning || ended) {
        return;
      }
      if (key === "ArrowLeft") {
        piece.x -= 1;
        if (collides()) {
          piece.x += 1;
        }
      }
      if (key === "ArrowRight") {
        piece.x += 1;
        if (collides()) {
          piece.x -= 1;
        }
      }
      if (key === "ArrowDown") {
        drop();
      }
      if (key === "ArrowUp" || key === " ") {
        const previous = piece.shape;
        piece.shape = rotate(piece.shape);
        if (collides()) {
          piece.shape = previous;
        }
      }
    },
    getHud() {
      return {
        score,
        level,
        lines,
        nextPiece: nextPiece?.shape?.[0]?.length ? `${nextPiece.shape.length}x${nextPiece.shape[0].length}` : "-"
      };
    },
    isOver() {
      return ended;
    }
  };
}

function createSnakeGame() {
  const gridSize = 24;
  const boardSize = 20;
  const areaSize = gridSize * boardSize;
  const offsetX = Math.round((CANVAS_WIDTH - areaSize) / 2);
  const offsetY = 116;

  let snake = [];
  let direction = { x: 1, y: 0 };
  let nextDirection = { x: 1, y: 0 };
  let food = { x: 5, y: 5 };
  let timer = 0;
  let score = 0;
  let ended = false;

  function placeFood() {
    let valid = false;
    while (!valid) {
      food = { x: randomInt(boardSize), y: randomInt(boardSize) };
      valid = !snake.some(segment => segment.x === food.x && segment.y === food.y);
    }
  }

  return {
    start() {
      this.reset();
    },
    reset() {
      snake = [
        { x: 8, y: 10 },
        { x: 7, y: 10 },
        { x: 6, y: 10 }
      ];
      direction = { x: 1, y: 0 };
      nextDirection = { x: 1, y: 0 };
      timer = 0;
      score = 0;
      ended = false;
      placeFood();
    },
    update(delta, isRunning) {
      if (!isRunning || ended) {
        return;
      }
      timer += delta;
      const interval = Math.max(70, 170 - score * 3);
      if (timer < interval) {
        return;
      }
      timer = 0;
      direction = nextDirection;
      const head = {
        x: snake[0].x + direction.x,
        y: snake[0].y + direction.y
      };
      const hitWall = head.x < 0 || head.y < 0 || head.x >= boardSize || head.y >= boardSize;
      const hitSelf = snake.some(segment => segment.x === head.x && segment.y === head.y);
      if (hitWall || hitSelf) {
        ended = true;
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 1;
        placeFood();
      } else {
        snake.pop();
      }
    },
    render(isRunning, isPaused) {
      drawStageFrame("Snake", "#90be6d");
      fillRoundedRect(offsetX - 18, offsetY - 18, areaSize + 36, areaSize + 36, 26, "rgba(255,255,255,0.04)");
      for (let y = 0; y < boardSize; y += 1) {
        for (let x = 0; x < boardSize; x += 1) {
          const px = offsetX + x * gridSize;
          const py = offsetY + y * gridSize;
          ctx.fillStyle = (x + y) % 2 === 0 ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)";
          ctx.fillRect(px, py, gridSize - 1, gridSize - 1);
        }
      }
      snake.forEach((segment, index) => {
        const px = offsetX + segment.x * gridSize;
        const py = offsetY + segment.y * gridSize;
        fillRoundedRect(px + 1, py + 1, gridSize - 3, gridSize - 3, 7, index === 0 ? "#d9f99d" : "#90be6d");
      });
      fillRoundedRect(offsetX + food.x * gridSize + 2, offsetY + food.y * gridSize + 2, gridSize - 5, gridSize - 5, 8, "#f28482");
      if (ended) {
        drawOverlay("Run Ended", "Press Reset to play Snake again.");
      } else if (!isRunning) {
        drawOverlay("Ready", "Press Start to begin Snake.");
      } else if (isPaused) {
        drawOverlay("Paused", "Press Start to continue the run.");
      }
    },
    getResult() {
      return { score };
    },
    onKeyDown(key, isRunning) {
      if (!isRunning || ended) {
        return;
      }
      if (key === "ArrowUp" && direction.y !== 1) {
        nextDirection = { x: 0, y: -1 };
      }
      if (key === "ArrowDown" && direction.y !== -1) {
        nextDirection = { x: 0, y: 1 };
      }
      if (key === "ArrowLeft" && direction.x !== 1) {
        nextDirection = { x: -1, y: 0 };
      }
      if (key === "ArrowRight" && direction.x !== -1) {
        nextDirection = { x: 1, y: 0 };
      }
    },
    getHud() {
      return {
        score,
        level: snake.length,
        lines: Math.max(1, 6 + score),
        nextPiece: "Food"
      };
    },
    isOver() {
      return ended;
    }
  };
}

function createBreakoutGame() {
  const paddle = { width: 124, height: 14, x: 0, speed: 8 };
  const ball = { x: 0, y: 0, vx: 4.2, vy: -4.4, radius: 9 };
  const keys = { left: false, right: false };
  let bricks = [];
  let score = 0;
  let lives = 3;
  let ended = false;

  function buildBricks() {
    bricks = [];
    const rows = 5;
    const cols = 8;
    const brickWidth = 62;
    const brickHeight = 20;
    const gap = 10;
    const startX = 43;
    const startY = 120;
    const colors = ["#f28482", "#f6bd60", "#84a59d", "#5c7cfa", "#9d4edd"];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        bricks.push({
          x: startX + col * (brickWidth + gap),
          y: startY + row * (brickHeight + gap),
          width: brickWidth,
          height: brickHeight,
          color: colors[row],
          alive: true
        });
      }
    }
  }

  function resetBall() {
    paddle.x = CANVAS_WIDTH / 2 - paddle.width / 2;
    ball.x = CANVAS_WIDTH / 2;
    ball.y = CANVAS_HEIGHT - 112;
    ball.vx = Math.random() > 0.5 ? 4.2 : -4.2;
    ball.vy = -4.4;
  }

  function aliveBricks() {
    return bricks.filter(brick => brick.alive).length;
  }

  return {
    start() {
      this.reset();
    },
    reset() {
      buildBricks();
      resetBall();
      score = 0;
      lives = 3;
      ended = false;
      keys.left = false;
      keys.right = false;
    },
    update(_delta, isRunning) {
      if (!isRunning || ended) {
        return;
      }
      if (keys.left) {
        paddle.x = Math.max(22, paddle.x - paddle.speed);
      }
      if (keys.right) {
        paddle.x = Math.min(CANVAS_WIDTH - paddle.width - 22, paddle.x + paddle.speed);
      }

      ball.x += ball.vx;
      ball.y += ball.vy;

      if (ball.x - ball.radius <= 22 || ball.x + ball.radius >= CANVAS_WIDTH - 22) {
        ball.vx *= -1;
      }
      if (ball.y - ball.radius <= 84) {
        ball.vy *= -1;
      }

      if (
        ball.y + ball.radius >= CANVAS_HEIGHT - 52 &&
        ball.x >= paddle.x &&
        ball.x <= paddle.x + paddle.width &&
        ball.vy > 0
      ) {
        const hitPoint = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
        ball.vx = hitPoint * 5.5;
        ball.vy *= -1;
      }

      for (const brick of bricks) {
        if (!brick.alive) {
          continue;
        }
        const hit =
          ball.x + ball.radius >= brick.x &&
          ball.x - ball.radius <= brick.x + brick.width &&
          ball.y + ball.radius >= brick.y &&
          ball.y - ball.radius <= brick.y + brick.height;
        if (hit) {
          brick.alive = false;
          ball.vy *= -1;
          score += 25;
          break;
        }
      }

      if (ball.y - ball.radius > CANVAS_HEIGHT) {
        lives -= 1;
        if (lives <= 0) {
          ended = true;
        } else {
          resetBall();
        }
      }

      if (aliveBricks() === 0) {
        ended = true;
      }
    },
    render(isRunning, isPaused) {
      drawStageFrame("Brick Breaker", "#f6bd60");
      fillRoundedRect(22, 84, CANVAS_WIDTH - 44, CANVAS_HEIGHT - 136, 28, "rgba(255,255,255,0.03)");
      bricks.forEach(brick => {
        if (brick.alive) {
          fillRoundedRect(brick.x, brick.y, brick.width, brick.height, 8, brick.color);
        }
      });
      fillRoundedRect(paddle.x, CANVAS_HEIGHT - 52, paddle.width, paddle.height, 10, "#dfe7ec");
      ctx.beginPath();
      ctx.fillStyle = "#f7f3ec";
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fill();
      if (ended && lives <= 0) {
        drawOverlay("Match Over", "Press Reset to restart Brick Breaker.");
      } else if (ended) {
        drawOverlay("Board Cleared", "Press Reset for another round.");
      } else if (!isRunning) {
        drawOverlay("Ready", "Press Start to launch the ball.");
      } else if (isPaused) {
        drawOverlay("Paused", "Press Start to continue the match.");
      }
    },
    getResult() {
      return { score };
    },
    onKeyDown(key) {
      if (key === "ArrowLeft") {
        keys.left = true;
      }
      if (key === "ArrowRight") {
        keys.right = true;
      }
    },
    onKeyUp(key) {
      if (key === "ArrowLeft") {
        keys.left = false;
      }
      if (key === "ArrowRight") {
        keys.right = false;
      }
    },
    getHud() {
      return {
        score,
        level: lives,
        lines: aliveBricks(),
        nextPiece: "Ball"
      };
    },
    isOver() {
      return ended;
    }
  };
}

function createPongGame() {
  const paddleHeight = 108;
  const paddleWidth = 14;
  const player = { x: 36, y: 0, score: 0 };
  const opponent = { x: CANVAS_WIDTH - 50, y: 0, score: 0 };
  const ball = { x: 0, y: 0, vx: 4.8, vy: 3.6, size: 14 };
  const keys = { up: false, down: false };
  let ended = false;

  function centerBall(direction = 1) {
    ball.x = CANVAS_WIDTH / 2 - ball.size / 2;
    ball.y = CANVAS_HEIGHT / 2 - ball.size / 2;
    ball.vx = 4.8 * direction;
    ball.vy = Math.random() > 0.5 ? 3.6 : -3.6;
  }

  function resetPositions() {
    player.y = CANVAS_HEIGHT / 2 - paddleHeight / 2;
    opponent.y = CANVAS_HEIGHT / 2 - paddleHeight / 2;
    centerBall(Math.random() > 0.5 ? 1 : -1);
  }

  function paddleHit(paddleX, paddleY) {
    return (
      ball.x < paddleX + paddleWidth &&
      ball.x + ball.size > paddleX &&
      ball.y < paddleY + paddleHeight &&
      ball.y + ball.size > paddleY
    );
  }

  return {
    start() {
      this.reset();
    },
    reset() {
      player.score = 0;
      opponent.score = 0;
      ended = false;
      keys.up = false;
      keys.down = false;
      resetPositions();
    },
    update(_delta, isRunning) {
      if (!isRunning || ended) {
        return;
      }
      if (keys.up) {
        player.y -= 7;
      }
      if (keys.down) {
        player.y += 7;
      }
      player.y = clamp(player.y, 80, CANVAS_HEIGHT - paddleHeight - 30);

      const opponentCenter = opponent.y + paddleHeight / 2;
      if (opponentCenter < ball.y) {
        opponent.y += 4.2;
      } else {
        opponent.y -= 4.2;
      }
      opponent.y = clamp(opponent.y, 80, CANVAS_HEIGHT - paddleHeight - 30);

      ball.x += ball.vx;
      ball.y += ball.vy;

      if (ball.y <= 82 || ball.y + ball.size >= CANVAS_HEIGHT - 24) {
        ball.vy *= -1;
      }
      if (paddleHit(player.x, player.y) && ball.vx < 0) {
        ball.vx *= -1;
      }
      if (paddleHit(opponent.x, opponent.y) && ball.vx > 0) {
        ball.vx *= -1;
      }

      if (ball.x < 0) {
        opponent.score += 1;
        centerBall(1);
      }
      if (ball.x > CANVAS_WIDTH) {
        player.score += 1;
        centerBall(-1);
      }

      if (player.score >= 7 || opponent.score >= 7) {
        ended = true;
      }
    },
    render(isRunning, isPaused) {
      drawStageFrame("Pong", "#5c7cfa");
      ctx.setLineDash([14, 14]);
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.moveTo(CANVAS_WIDTH / 2, 88);
      ctx.lineTo(CANVAS_WIDTH / 2, CANVAS_HEIGHT - 30);
      ctx.stroke();
      ctx.setLineDash([]);
      fillRoundedRect(player.x, player.y, paddleWidth, paddleHeight, 8, "#dfe7ec");
      fillRoundedRect(opponent.x, opponent.y, paddleWidth, paddleHeight, 8, "#9db4ff");
      fillRoundedRect(ball.x, ball.y, ball.size, ball.size, 4, "#f7f3ec");
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "700 56px Georgia";
      ctx.fillText(String(player.score), CANVAS_WIDTH / 2 - 80, 140);
      ctx.fillText(String(opponent.score), CANVAS_WIDTH / 2 + 48, 140);
      if (ended) {
        const title = player.score > opponent.score ? "You Won" : "Computer Won";
        drawOverlay(title, "Press Reset to start another Pong match.");
      } else if (!isRunning) {
        drawOverlay("Ready", "Press Start to begin Pong.");
      } else if (isPaused) {
        drawOverlay("Paused", "Press Start to continue the rally.");
      }
    },
    getResult() {
      return { score: player.score };
    },
    onKeyDown(key) {
      if (key === "ArrowUp") {
        keys.up = true;
      }
      if (key === "ArrowDown") {
        keys.down = true;
      }
    },
    onKeyUp(key) {
      if (key === "ArrowUp") {
        keys.up = false;
      }
      if (key === "ArrowDown") {
        keys.down = false;
      }
    },
    getHud() {
      return {
        score: player.score,
        level: opponent.score,
        lines: 7,
        nextPiece: "Serve"
      };
    },
    isOver() {
      return ended;
    }
  };
}

const games = {
  tetris: {
    id: "tetris",
    name: "Tetris",
    tag: "Logic",
    difficulty: "Medium",
    mode: "Interactive board",
    accent: "#1b4d3e",
    icon: "TD",
    description: "Stack falling blocks and clear lines with steady rising speed.",
    controls: [
      ["Left / Right", "Move piece"],
      ["Up / Space", "Rotate piece"],
      ["Down", "Soft drop"]
    ],
    factory: createTetrisGame
  },
  snake: {
    id: "snake",
    name: "Snake",
    tag: "Arcade",
    difficulty: "Easy",
    mode: "Grid chase",
    accent: "#4f7d62",
    icon: "SK",
    description: "Guide the snake, collect food, and survive the tightening pace.",
    controls: [
      ["Arrow Keys", "Change direction"]
    ],
    factory: createSnakeGame
  },
  breakout: {
    id: "breakout",
    name: "Brick Breaker",
    tag: "Reflex",
    difficulty: "Medium",
    mode: "Paddle action",
    accent: "#c4873a",
    icon: "BB",
    description: "Control the paddle, break the wall, and keep the ball in play.",
    controls: [
      ["Left / Right", "Move paddle"]
    ],
    factory: createBreakoutGame
  },
  pong: {
    id: "pong",
    name: "Pong",
    tag: "Competitive",
    difficulty: "Easy",
    mode: "Versus duel",
    accent: "#6e7c95",
    icon: "PG",
    description: "Play a crisp one-on-one paddle match against the computer.",
    controls: [
      ["Up / Down", "Move paddle"]
    ],
    factory: createPongGame
  }
};

function renderCatalog() {
  gameList.innerHTML = "";
  Object.values(games).forEach(game => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `game-card${game.id === selectedGameId ? " active" : ""}`;
    button.innerHTML = `
      <div class="game-card-top">
        <div class="game-icon" style="background:${game.accent}">${game.icon}</div>
        <div>
          <h3>${game.name}</h3>
          <p>${game.description}</p>
        </div>
      </div>
      <div class="game-meta">
        <span class="info-badge">${game.tag}</span>
        <span class="info-badge tone-warm">${game.difficulty}</span>
      </div>
    `;
    button.addEventListener("click", () => selectGame(game.id));
    gameList.appendChild(button);
  });
}

function renderHud() {
  const hud = activeGame.getHud?.() || { score: 0, level: 1, lines: 0, nextPiece: "-" };
  hudScore.textContent = `${hud.score ?? 0}`;
  hudLevel.textContent = `${hud.level ?? 1}`;
  hudLines.textContent = `${hud.lines ?? 0}`;
  nextPiecePreview.textContent = hud.nextPiece ?? "-";
}

function renderControls(game) {
  controlsList.innerHTML = "";
  game.controls.forEach(([key, action]) => {
    const item = document.createElement("li");
    item.innerHTML = `<strong>${key}</strong><span>${action}</span>`;
    controlsList.appendChild(item);
  });
}

function selectGame(gameId) {
  selectedGameId = gameId;
  const config = games[gameId];
  activeGameName.textContent = config.name;
  activeGameDescription.textContent = config.description;
  activeGameTag.textContent = config.tag;
  activeGameDifficulty.textContent = config.difficulty;
  activeGameMode.textContent = config.mode;
  renderControls(config);
  renderCatalog();
  activeGame = config.factory();
  activeGame.reset();
  scoreSubmittedForRound = false;
  setSessionState("ready", `Selected ${config.name}. Press Start to begin.`);
  startButton.dataset.running = "false";
  pauseButton.dataset.paused = "false";
  syncActionLabels();
  renderScene();
}

function isRunning() {
  return startButton.dataset.running === "true";
}

function setRunning(value) {
  startButton.dataset.running = value ? "true" : "false";
  syncActionLabels();
}

function syncActionLabels() {
  const paused = pauseButton.dataset.paused === "true";
  startButton.textContent = isRunning() ? "Running" : paused ? "Resume" : "Start";
  pauseButton.textContent = paused ? "Unpause" : "Pause";
}

function setSessionState(state, message) {
  canvasShell.dataset.sessionState = state;
  canvasStateLabel.textContent = {
    ready: "Press Start",
    running: "Running",
    paused: "Paused",
    ended: "Run Complete"
  }[state] || "Ready";
  canvasOverlay.textContent = {
    ready: "Press Start",
    running: "",
    paused: "Paused",
    ended: "Run Complete"
  }[state] || "";
  if (message) {
    statusText.textContent = message;
  }
}

function renderScene() {
  activeGame.render(isRunning(), pauseButton.dataset.paused === "true");
  renderHud();
}

startButton.addEventListener("click", () => {
  if (activeGame.isOver()) {
    activeGame.reset();
    scoreSubmittedForRound = false;
  }
  pauseButton.dataset.paused = "false";
  setRunning(true);
  setSessionState("running", `${games[selectedGameId].name} is running.`);
});

pauseButton.addEventListener("click", () => {
  if (!isRunning() && pauseButton.dataset.paused !== "true") {
    return;
  }
  const nextPaused = pauseButton.dataset.paused !== "true";
  pauseButton.dataset.paused = nextPaused ? "true" : "false";
  setRunning(!nextPaused);
  setSessionState(nextPaused ? "paused" : "running", nextPaused ? "Game paused." : `${games[selectedGameId].name} resumed.`);
});

resetButton.addEventListener("click", () => {
  activeGame.reset();
  scoreSubmittedForRound = false;
  pauseButton.dataset.paused = "false";
  setRunning(false);
  setSessionState("ready", `${games[selectedGameId].name} has been reset.`);
  renderScene();
});

authForm.addEventListener("submit", async event => {
  event.preventDefault();
  const mode = event.submitter?.dataset.mode || "login";
  const payload = {
    name: authName.value.trim(),
    email: authEmail.value.trim(),
    password: authPassword.value
  };

  try {
    let response;
    if (mode === "register") {
      response = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          name: authName.value.trim(),
          email: payload.email,
          password: payload.password
        })
      });
    } else {
      response = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    }

    renderAuth(response.user, response.high_scores || []);
    setAuthMessage(`${response.user.email}. Your scores will now be saved automatically.`);
    authPassword.value = "";
    closeAuthFlyout();
  } catch (error) {
    setAuthMessage(error.message);
  }
});

googleAuth.addEventListener("click", () => {
  if (googleAuth.disabled) {
    setAuthMessage("Google OAuth still looks unavailable. Restart the backend after editing backend/.env, then try again.");
    return;
  }
  googleAuthPopup = window.open(
    "/api/auth/google/login?popup=1",
    "googleAuthPopup",
    "popup=yes,width=520,height=720,resizable=yes,scrollbars=yes"
  );
  if (!googleAuthPopup) {
    setAuthMessage("Popup blocked. Allow popups for this site or open the app in a normal browser tab.");
    return;
  }
  setAuthMessage("Waiting for Google sign-in...");
});

logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
    renderAuth(null);
    closeAuthFlyout();
  } catch (error) {
    setAuthMessage(error.message);
  }
});

accountToggle.addEventListener("click", event => {
  event.stopPropagation();
  accountToggle.parentElement.classList.toggle("open");
});

authFlyout.addEventListener("click", event => {
  event.stopPropagation();
});

document.addEventListener("click", event => {
  if (!accountToggle.parentElement.contains(event.target)) {
    closeAuthFlyout();
  }
});

window.addEventListener("message", async event => {
  if (event.origin !== window.location.origin) {
    return;
  }
  if (event.data?.type !== "google-auth") {
    return;
  }

  if (event.data.success) {
    authFlashMessage = "Google sign-in complete.";
    await refreshSession();
    closeAuthFlyout();
    return;
  }

  setAuthMessage(event.data.message || "Google sign-in failed.");
});

document.addEventListener("keydown", event => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(event.key)) {
    event.preventDefault();
  }
  activeGame.onKeyDown?.(event.key, isRunning());
});

document.addEventListener("keyup", event => {
  activeGame.onKeyUp?.(event.key, isRunning());
});

function frame(time = 0) {
  const delta = time - lastFrame;
  lastFrame = time;
  const paused = pauseButton.dataset.paused === "true";
  activeGame.update(delta, isRunning() && !paused);
  if (activeGame.isOver() && isRunning() && !scoreSubmittedForRound) {
    scoreSubmittedForRound = true;
    const result = activeGame.getResult?.();
    if (currentUser && result && typeof result.score === "number") {
      api("/api/games/result", {
        method: "POST",
        body: JSON.stringify({
          game_key: selectedGameId,
          score: result.score,
          details: {
            game_name: games[selectedGameId].name
          }
        })
      })
        .then(response => {
          if (response.best_scores) {
            renderAuth(currentUser, response.best_scores);
          }
        })
        .catch(() => {});
    }
    setRunning(false);
    setSessionState("ended", `${games[selectedGameId].name} session finished. Press Reset to play again.`);
  }
  renderScene();
  requestAnimationFrame(frame);
}

pauseButton.dataset.paused = "false";
selectGame(selectedGameId);
consumeAuthQueryState();
refreshProviders();
refreshSession();
requestAnimationFrame(frame);
