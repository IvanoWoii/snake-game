const canvas = document.getElementById("game");
const context = canvas.getContext("2d");
const scoreElement = document.getElementById("score");
const bestScoreElement = document.getElementById("best-score");
const skinNameElement = document.getElementById("skin-name");
const statusElement = document.getElementById("status");
const restartButton = document.getElementById("restart-btn");
const controlButtons = document.querySelectorAll("[data-direction]");

const gridSize = 20;
const tileCount = canvas.width / gridSize;
const bestScoreKey = "snake-best-score";
const startingTickMs = 220;
const minTickMs = 85;
const speedStepMs = 10;

const directionMap = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
};

const skins = [
  {
    minScore: 0,
    name: "Baby Blob",
    body: "#b9d36f",
    bodyShade: "#97b54f",
    highlight: "rgba(245, 255, 195, 0.9)",
    head: "#d7e88d",
    accent: "#ff8e9e",
    cheek: "rgba(255, 154, 173, 0.9)",
    eyeWhite: "#fffaf1",
    eye: "#342922",
    pupilScale: 0.9,
    stripe: false,
    crown: false,
    horn: false,
  },
  {
    minScore: 5,
    name: "Street Racer",
    body: "#15b97c",
    bodyShade: "#0b8c5b",
    highlight: "rgba(180, 255, 221, 0.85)",
    head: "#0f9f68",
    accent: "#ffd166",
    cheek: null,
    eyeWhite: "#f6fff5",
    eye: "#14110f",
    pupilScale: 1,
    stripe: true,
    crown: false,
    horn: false,
  },
  {
    minScore: 12,
    name: "Royal Viper",
    body: "#2767d6",
    bodyShade: "#183f8f",
    highlight: "rgba(183, 214, 255, 0.82)",
    head: "#1f54b0",
    accent: "#f6d365",
    cheek: null,
    eyeWhite: "#fffdf8",
    eye: "#131313",
    pupilScale: 1.05,
    stripe: true,
    crown: true,
    horn: false,
  },
  {
    minScore: 20,
    name: "Mythic Plasma",
    body: "#882eff",
    bodyShade: "#5410a9",
    highlight: "rgba(229, 187, 255, 0.88)",
    head: "#a246ff",
    accent: "#4ff4ff",
    cheek: null,
    eyeWhite: "#ffffff",
    eye: "#090909",
    pupilScale: 1.1,
    stripe: true,
    crown: false,
    horn: true,
  },
];

let snake;
let previousSnake;
let direction;
let queuedDirection;
let food;
let score;
let bestScore;
let gameStarted;
let gameOver;
let currentTickMs;
let elapsedSinceStep;
let lastFrameTime = 0;
let animationHandle;
let currentSkinName;

function cloneSnake(source) {
  return source.map((segment) => ({ ...segment }));
}

function getBestScore() {
  const stored = Number.parseInt(localStorage.getItem(bestScoreKey) || "0", 10);
  return Number.isFinite(stored) ? stored : 0;
}

function getCurrentSkin() {
  let activeSkin = skins[0];

  for (const skin of skins) {
    if (score >= skin.minScore) {
      activeSkin = skin;
    }
  }

  return activeSkin;
}

function syncHud() {
  scoreElement.textContent = String(score);
  bestScoreElement.textContent = String(bestScore);
  skinNameElement.textContent = getCurrentSkin().name;
}

function getTickMs() {
  return Math.max(minTickMs, startingTickMs - score * speedStepMs);
}

function setDirection(nextDirection) {
  if (gameOver) {
    return;
  }

  const activeDirection = queuedDirection || direction;
  const reversing =
    snake.length > 1 &&
    nextDirection.x === -activeDirection.x &&
    nextDirection.y === -activeDirection.y;

  if (!reversing) {
    queuedDirection = nextDirection;
    if (!gameStarted) {
      gameStarted = true;
      statusElement.textContent = "Collect the fruit.";
    }
  }
}

function randomFoodPosition() {
  while (true) {
    const candidate = {
      x: Math.floor(Math.random() * tileCount),
      y: Math.floor(Math.random() * tileCount),
    };

    const overlapsSnake = snake.some(
      (segment) => segment.x === candidate.x && segment.y === candidate.y,
    );

    if (!overlapsSnake) {
      return candidate;
    }
  }
}

function resetGame() {
  snake = [
    { x: 10, y: 10 },
    { x: 9, y: 10 },
    { x: 8, y: 10 },
  ];
  previousSnake = cloneSnake(snake);
  direction = { x: 1, y: 0 };
  queuedDirection = { x: 1, y: 0 };
  food = { x: 14, y: 10 };
  score = 0;
  currentTickMs = getTickMs();
  elapsedSinceStep = 0;
  gameStarted = false;
  gameOver = false;
  currentSkinName = getCurrentSkin().name;
  statusElement.textContent = "Press any direction to start.";
  syncHud();
  draw(0);
}

function endGame() {
  gameOver = true;
  elapsedSinceStep = 0;
  statusElement.textContent = "Game over. Press Restart to try again.";
}

function updateStatusAfterFruit(skinUnlocked) {
  if (skinUnlocked) {
    statusElement.textContent =
      currentTickMs === minTickMs
        ? `${currentSkinName} unlocked. Max speed reached.`
        : `${currentSkinName} unlocked. Speed increased.`;
    return;
  }

  statusElement.textContent =
    currentTickMs === minTickMs
      ? "Max speed reached. Hold the line."
      : "Nice. Speed increased.";
}

function step() {
  if (!gameStarted || gameOver) {
    return;
  }

  previousSnake = cloneSnake(snake);
  direction = queuedDirection;

  const nextHead = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y,
  };
  const willEat = nextHead.x === food.x && nextHead.y === food.y;
  const collisionBody = willEat ? snake : snake.slice(0, -1);

  const hitsWall =
    nextHead.x < 0 ||
    nextHead.x >= tileCount ||
    nextHead.y < 0 ||
    nextHead.y >= tileCount;

  const hitsSelf = collisionBody.some(
    (segment) => segment.x === nextHead.x && segment.y === nextHead.y,
  );

  if (hitsWall || hitsSelf) {
    endGame();
    return;
  }

  snake.unshift(nextHead);

  if (willEat) {
    score += 1;
    currentTickMs = getTickMs();
    if (score > bestScore) {
      bestScore = score;
      localStorage.setItem(bestScoreKey, String(bestScore));
    }
    food = randomFoodPosition();

    const newSkinName = getCurrentSkin().name;
    const skinUnlocked = newSkinName !== currentSkinName;
    currentSkinName = newSkinName;
    updateStatusAfterFruit(skinUnlocked);
    syncHud();
  } else {
    snake.pop();
  }
}

function getMoveProgress() {
  if (!gameStarted || gameOver) {
    return 0;
  }

  return Math.min(1, elapsedSinceStep / currentTickMs);
}

function lerp(from, to, progress) {
  return from + (to - from) * progress;
}

function getRenderSegment(segment, index, progress) {
  if (index === 0) {
    const origin = previousSnake[0] || segment;
    return {
      x: lerp(origin.x, segment.x, progress),
      y: lerp(origin.y, segment.y, progress),
    };
  }

  const origin = previousSnake[index - 1] || segment;
  return {
    x: lerp(origin.x, segment.x, progress),
    y: lerp(origin.y, segment.y, progress),
  };
}

function getRenderSnake(progress) {
  return snake.map((segment, index) => getRenderSegment(segment, index, progress));
}

function toCanvasCenter(segment) {
  return {
    x: segment.x * gridSize + gridSize / 2,
    y: segment.y * gridSize + gridSize / 2,
  };
}

function drawGrid() {
  context.strokeStyle = "rgba(72, 53, 37, 0.08)";
  context.lineWidth = 1;

  for (let i = 0; i <= tileCount; i += 1) {
    const position = i * gridSize;

    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, canvas.height);
    context.stroke();

    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(canvas.width, position);
    context.stroke();
  }
}

function drawFood() {
  const center = toCanvasCenter(food);

  context.fillStyle = "#d33d2f";
  context.beginPath();
  context.arc(center.x, center.y + 1, gridSize * 0.3, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#57a441";
  context.beginPath();
  context.ellipse(center.x + 4, center.y - 7, 4, 2.5, -0.45, 0, Math.PI * 2);
  context.fill();
}

function drawSnakeBody(renderSnake, skin) {
  if (renderSnake.length < 2) {
    return;
  }

  context.lineCap = "round";
  context.lineJoin = "round";

  context.strokeStyle = skin.bodyShade;
  context.lineWidth = gridSize - 2;
  context.beginPath();
  renderSnake.forEach((segment, index) => {
    const center = toCanvasCenter(segment);
    if (index === 0) {
      context.moveTo(center.x, center.y);
    } else {
      context.lineTo(center.x, center.y);
    }
  });
  context.stroke();

  context.strokeStyle = skin.body;
  context.lineWidth = gridSize - 6;
  context.beginPath();
  renderSnake.forEach((segment, index) => {
    const center = toCanvasCenter(segment);
    if (index === 0) {
      context.moveTo(center.x, center.y);
    } else {
      context.lineTo(center.x, center.y);
    }
  });
  context.stroke();

  context.strokeStyle = skin.highlight;
  context.lineWidth = 5;
  context.beginPath();
  renderSnake.forEach((segment, index) => {
    const center = toCanvasCenter(segment);
    if (index === 0) {
      context.moveTo(center.x - direction.x * 2, center.y - direction.y * 2);
    } else {
      context.lineTo(center.x, center.y);
    }
  });
  context.stroke();

  if (skin.stripe) {
    context.strokeStyle = skin.accent;
    context.lineWidth = 2.5;
    context.setLineDash([7, 9]);
    context.beginPath();
    renderSnake.forEach((segment, index) => {
      const center = toCanvasCenter(segment);
      if (index === 0) {
        context.moveTo(center.x, center.y);
      } else {
        context.lineTo(center.x, center.y);
      }
    });
    context.stroke();
    context.setLineDash([]);
  }
}

function drawSnakeTail(renderSnake, skin) {
  const tail = renderSnake[renderSnake.length - 1];
  const beforeTail = renderSnake[renderSnake.length - 2];
  if (!tail || !beforeTail) {
    return;
  }

  const tailCenter = toCanvasCenter(tail);
  const previousCenter = toCanvasCenter(beforeTail);
  const dx = tailCenter.x - previousCenter.x;
  const dy = tailCenter.y - previousCenter.y;

  context.save();
  context.translate(tailCenter.x, tailCenter.y);
  context.rotate(Math.atan2(dy, dx));

  context.fillStyle = skin.body;
  context.beginPath();
  context.moveTo(6, 0);
  context.quadraticCurveTo(-2, 8, -10, 0);
  context.quadraticCurveTo(-2, -8, 6, 0);
  context.fill();

  context.restore();
}

function drawSkinDecoration(skin) {
  if (skin.crown) {
    context.fillStyle = skin.accent;
    context.beginPath();
    context.moveTo(-6, -8);
    context.lineTo(-2, -15);
    context.lineTo(2, -8);
    context.lineTo(6, -15);
    context.lineTo(10, -8);
    context.lineTo(10, -4);
    context.lineTo(-6, -4);
    context.closePath();
    context.fill();
  }

  if (skin.horn) {
    context.fillStyle = skin.accent;
    context.beginPath();
    context.moveTo(-8, -4);
    context.lineTo(-15, -8);
    context.lineTo(-12, -1);
    context.closePath();
    context.fill();

    context.beginPath();
    context.moveTo(-8, 4);
    context.lineTo(-15, 8);
    context.lineTo(-12, 1);
    context.closePath();
    context.fill();
  }
}

function drawSnakeHead(renderSnake, skin) {
  const head = renderSnake[0];
  const neck = renderSnake[1] || {
    x: head.x - direction.x,
    y: head.y - direction.y,
  };
  const headCenter = toCanvasCenter(head);
  const neckCenter = toCanvasCenter(neck);
  const angle = Math.atan2(headCenter.y - neckCenter.y, headCenter.x - neckCenter.x);
  const headLength = gridSize;
  const headWidth = gridSize - 3;

  context.save();
  context.translate(headCenter.x, headCenter.y);
  context.rotate(angle);

  context.fillStyle = skin.head;
  context.beginPath();
  context.ellipse(0, 0, headLength / 2, headWidth / 2, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = skin.highlight;
  context.beginPath();
  context.ellipse(-1, -3, 5.5, 3, -0.2, 0, Math.PI * 2);
  context.fill();

  if (skin.cheek) {
    context.fillStyle = skin.cheek;
    context.beginPath();
    context.arc(0, -5.5, 2.2, 0, Math.PI * 2);
    context.arc(0, 5.5, 2.2, 0, Math.PI * 2);
    context.fill();
  }

  drawSkinDecoration(skin);

  context.fillStyle = skin.eyeWhite;
  context.beginPath();
  context.arc(4, -4.5, 2.8, 0, Math.PI * 2);
  context.arc(4, 4.5, 2.8, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = skin.eye;
  context.beginPath();
  context.arc(5, -4.5, 1.2 * skin.pupilScale, 0, Math.PI * 2);
  context.arc(5, 4.5, 1.2 * skin.pupilScale, 0, Math.PI * 2);
  context.fill();

  context.strokeStyle = skin.accent;
  context.lineWidth = 1.8;
  context.beginPath();
  context.moveTo(headLength / 2 - 2, 0);
  context.lineTo(headLength / 2 + 4, -2);
  context.lineTo(headLength / 2 + 7, 0);
  context.lineTo(headLength / 2 + 4, 2);
  context.stroke();

  context.restore();
}

function draw(progress) {
  const renderSnake = getRenderSnake(progress);
  const skin = getCurrentSkin();

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f8ecd9";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawGrid();
  drawFood();
  drawSnakeBody(renderSnake, skin);
  drawSnakeTail(renderSnake, skin);
  drawSnakeHead(renderSnake, skin);

  if (!gameStarted && !gameOver) {
    context.fillStyle = "rgba(47, 36, 28, 0.82)";
    context.font = "700 20px 'Space Grotesk', sans-serif";
    context.textAlign = "center";
    context.fillText("Press a direction to begin", canvas.width / 2, canvas.height / 2);
  }
}

function renderFrame(timestamp) {
  if (!lastFrameTime) {
    lastFrameTime = timestamp;
  }

  const delta = Math.min(40, timestamp - lastFrameTime);
  lastFrameTime = timestamp;

  if (gameStarted && !gameOver) {
    elapsedSinceStep += delta;

    while (elapsedSinceStep >= currentTickMs) {
      elapsedSinceStep -= currentTickMs;
      step();

      if (gameOver) {
        break;
      }
    }
  }

  draw(getMoveProgress());
  animationHandle = window.requestAnimationFrame(renderFrame);
}

document.addEventListener("keydown", (event) => {
  const nextDirection = directionMap[event.key];
  if (!nextDirection) {
    return;
  }

  event.preventDefault();
  setDirection(nextDirection);
});

controlButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextDirection =
      directionMap[
        `Arrow${button.dataset.direction[0].toUpperCase()}${button.dataset.direction.slice(1)}`
      ];
    setDirection(nextDirection);
  });
});

restartButton.addEventListener("click", resetGame);

bestScore = getBestScore();
resetGame();
animationHandle = window.requestAnimationFrame(renderFrame);
