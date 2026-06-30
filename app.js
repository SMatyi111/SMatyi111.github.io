import {
  calculateStreak,
  challengeNumber,
  createChallenge,
  millisecondsUntilNextUtcDay,
  resultGrid,
  scoreRound,
  summarizeGame,
  utcDayKey
} from "./game-engine.js?v=0.1.1";
import { analyticsChoice, resetAllLocalData, setAnalyticsChoice, track } from "./analytics.js?v=0.1.1";

const STATE_KEY = "tracespark:game-state:v1";
const dayKey = utcDayKey();
const challenge = createChallenge(dayKey);

const elements = {
  welcome: document.querySelector("#welcome-view"),
  game: document.querySelector("#game-view"),
  result: document.querySelector("#result-view"),
  challengeNumber: document.querySelector("#challenge-number"),
  streak: document.querySelector("#streak-count"),
  authButton: document.querySelector("#auth-button"),
  previewButton: document.querySelector("#preview-button"),
  sdkStatus: document.querySelector("#sdk-status"),
  roundTitle: document.querySelector("#round-title"),
  roundDots: document.querySelector("#round-dots"),
  phaseIcon: document.querySelector("#phase-icon"),
  phaseTitle: document.querySelector("#phase-title"),
  phaseMessage: document.querySelector("#phase-message"),
  grid: document.querySelector("#spark-grid"),
  inputLabel: document.querySelector("#input-label"),
  inputMarks: document.querySelector("#input-marks"),
  resultPercent: document.querySelector("#result-percent"),
  resultTitle: document.querySelector("#result-title"),
  resultSummary: document.querySelector("#result-summary"),
  resultGrid: document.querySelector("#result-grid"),
  resultScore: document.querySelector("#result-score"),
  resultStreak: document.querySelector("#result-streak"),
  countdown: document.querySelector("#next-countdown"),
  shareButton: document.querySelector("#share-button"),
  replayButton: document.querySelector("#replay-button"),
  shareStatus: document.querySelector("#share-status"),
  consentDialog: document.querySelector("#consent-dialog"),
  allowAnalytics: document.querySelector("#allow-analytics"),
  declineAnalytics: document.querySelector("#decline-analytics"),
  privacySettings: document.querySelector("#privacy-settings-button")
};

let authenticated = false;
let previewMode = false;
let acceptingInput = false;
let currentRound = 0;
let currentInput = [];
let roundResults = [];
let countdownTimer;

function sleep(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY)) || { streak: null, completions: {} };
  } catch {
    return { streak: null, completions: {} };
  }
}

function writeState(state) {
  const days = Object.keys(state.completions || {}).sort().slice(-31);
  state.completions = Object.fromEntries(days.map((day) => [day, state.completions[day]]));
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function setView(name) {
  elements.welcome.hidden = name !== "welcome";
  elements.game.hidden = name !== "game";
  elements.result.hidden = name !== "result";
}

function setPhase(title, message, icon = "◉") {
  elements.phaseTitle.textContent = title;
  elements.phaseMessage.textContent = message;
  elements.phaseIcon.textContent = icon;
}

function buildGrid() {
  elements.grid.replaceChildren();
  for (let index = 0; index < 16; index += 1) {
    const button = document.createElement("button");
    button.className = "spark-cell";
    button.type = "button";
    button.dataset.cell = String(index);
    button.setAttribute("aria-label", `Spark ${index + 1}`);
    button.addEventListener("click", () => handleCell(index, button));
    elements.grid.append(button);
  }
}

function renderRoundProgress() {
  elements.roundDots.replaceChildren();
  challenge.forEach((_, index) => {
    const dot = document.createElement("span");
    if (index < currentRound) dot.className = "complete";
    if (index === currentRound) dot.className = "active";
    elements.roundDots.append(dot);
  });
}

function renderInputMarks(length) {
  elements.inputMarks.replaceChildren();
  for (let index = 0; index < length; index += 1) {
    const mark = document.createElement("span");
    const value = currentInput[index];
    if (value !== undefined) mark.className = value === challenge[currentRound][index] ? "correct" : "incorrect";
    elements.inputMarks.append(mark);
  }
}

async function previewPath(path) {
  acceptingInput = false;
  elements.grid.classList.remove("accepting");
  setPhase("Watch the path", `${path.length} sparks will light up.`, "◎");
  elements.inputLabel.textContent = "Watch closely";
  renderInputMarks(path.length);
  await sleep(650);

  for (const cell of path) {
    const button = elements.grid.querySelector(`[data-cell="${cell}"]`);
    button.classList.add("preview");
    await sleep(430);
    button.classList.remove("preview");
    await sleep(130);
  }

  setPhase("Your turn", "Tap the sparks in the same order.", "↗");
  elements.inputLabel.textContent = `0 of ${path.length}`;
  elements.grid.classList.add("accepting");
  acceptingInput = true;
}

async function beginRound() {
  currentInput = [];
  elements.roundTitle.textContent = `Round ${currentRound + 1} of ${challenge.length}`;
  renderRoundProgress();
  renderInputMarks(challenge[currentRound].length);
  await previewPath(challenge[currentRound]);
}

async function handleCell(cell, button) {
  if (!acceptingInput) return;
  const expected = challenge[currentRound][currentInput.length];
  currentInput.push(cell);
  button.classList.add(cell === expected ? "correct" : "incorrect");
  window.setTimeout(() => button.classList.remove("correct", "incorrect"), 260);
  renderInputMarks(challenge[currentRound].length);
  elements.inputLabel.textContent = `${currentInput.length} of ${challenge[currentRound].length}`;

  if (currentInput.length < challenge[currentRound].length) return;
  acceptingInput = false;
  elements.grid.classList.remove("accepting");
  const result = scoreRound(challenge[currentRound], currentInput);
  roundResults.push(result);
  setPhase(
    result.correct === result.total ? "Perfect trace" : `${result.correct} of ${result.total} correct`,
    currentRound + 1 < challenge.length ? "Next path coming up." : "Building your result.",
    result.correct === result.total ? "✓" : "◇"
  );
  await sleep(950);

  currentRound += 1;
  if (currentRound < challenge.length) await beginRound();
  else finishGame();
}

function resultMessage(summary) {
  if (summary.percent === 100) return ["Flawless signal.", "You traced every spark in order."];
  if (summary.percent >= 80) return ["Signal locked.", "A sharp run with only a little noise."];
  if (summary.percent >= 60) return ["Path captured.", "The signal held. Tomorrow brings a new route."];
  return ["Signal found.", "You completed the path. A fresh route arrives tomorrow."];
}

function updateCountdown() {
  const remaining = millisecondsUntilNextUtcDay();
  const hours = Math.floor(remaining / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  elements.countdown.textContent = `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function finishGame() {
  const summary = summarizeGame(roundResults);
  const state = readState();
  const firstCompletion = !state.completions?.[dayKey];
  const previousBest = state.completions?.[dayKey]?.bestScore || 0;
  state.streak = calculateStreak(state.streak, dayKey);
  state.completions = state.completions || {};
  state.completions[dayKey] = {
    bestScore: Math.max(previousBest, summary.points),
    completed: true
  };
  writeState(state);
  elements.streak.textContent = String(state.streak.current);

  const [title, message] = resultMessage(summary);
  elements.resultPercent.textContent = `${summary.percent}%`;
  elements.resultTitle.textContent = title;
  elements.resultSummary.textContent = message;
  elements.resultScore.textContent = String(summary.points);
  elements.resultStreak.textContent = `${state.streak.current} day${state.streak.current === 1 ? "" : "s"}`;
  elements.resultGrid.replaceChildren(
    ...resultGrid(roundResults).split("\n").map((row) => {
      const line = document.createElement("div");
      line.textContent = row;
      return line;
    })
  );

  setView("result");
  updateCountdown();
  window.clearInterval(countdownTimer);
  countdownTimer = window.setInterval(updateCountdown, 60000);
  track("game_complete", {
    mode: previewMode ? "browser_preview" : "pi_daily",
    score: summary.points,
    percent: summary.percent,
    streak: state.streak.current,
    firstCompletion
  });
}

async function startGame() {
  if (!authenticated && !previewMode) return;
  currentRound = 0;
  currentInput = [];
  roundResults = [];
  elements.shareStatus.textContent = "";
  setView("game");
  track("game_start", { mode: previewMode ? "browser_preview" : "pi_daily" });
  await sleep(250);
  beginRound();
}

function onIncompletePaymentFound() {
  // TraceSpark does not initiate payments. The callback is required by the Pi SDK.
}

function initializePi() {
  if (!window.Pi) {
    elements.sdkStatus.textContent = "Pi SDK is unavailable here. Use preview mode or open this page in Pi Browser.";
    elements.previewButton.hidden = false;
    return;
  }

  try {
    const params = new URLSearchParams(window.location.search);
    const local = ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
    const sandbox = params.get("sandbox") === "1" || (local && params.get("sandbox") !== "0");
    window.Pi.init({ version: "2.0", sandbox });
    elements.authButton.disabled = false;
    elements.sdkStatus.textContent = sandbox ? "Pi Testnet sandbox ready." : "Pi Testnet app ready.";
  } catch {
    elements.sdkStatus.textContent = "Pi connection failed. Browser preview remains available.";
    elements.previewButton.hidden = false;
  }
}

async function authenticate() {
  elements.authButton.disabled = true;
  elements.sdkStatus.textContent = "Waiting for Pi consent…";
  try {
    await window.Pi.authenticate([], onIncompletePaymentFound);
    authenticated = true;
    previewMode = false;
    elements.sdkStatus.textContent = "Signed in. Starting today's challenge…";
    track("auth_success", { mode: "pi_daily" });
    await startGame();
  } catch {
    elements.sdkStatus.textContent = "Sign-in did not complete. Try again when ready.";
    elements.authButton.disabled = false;
    elements.previewButton.hidden = false;
    track("auth_failure", { mode: "pi_daily" });
  }
}

function shareText() {
  const summary = summarizeGame(roundResults);
  return `TraceSpark #${challengeNumber(dayKey)} ${summary.percent}%\n${resultGrid(roundResults)}\n${summary.points} points · ${readState().streak?.current || 1} day streak\nCan you trace today's path?`;
}

async function shareResult() {
  const data = {
    title: "TraceSpark daily result",
    text: shareText(),
    url: window.location.origin + window.location.pathname.replace(/[^/]*$/, "")
  };

  try {
    if (navigator.share) {
      await navigator.share(data);
      elements.shareStatus.textContent = "Result shared.";
    } else {
      await navigator.clipboard.writeText(`${data.text}\n${data.url}`);
      elements.shareStatus.textContent = "Result copied. Paste it anywhere you choose.";
    }
    track("share_result", { mode: previewMode ? "browser_preview" : "pi_daily" });
  } catch (error) {
    if (error?.name !== "AbortError") elements.shareStatus.textContent = "Sharing failed. Try again.";
  }
}

function showConsentDialog() {
  if (!elements.consentDialog.open) elements.consentDialog.showModal();
}

elements.authButton.addEventListener("click", authenticate);
elements.previewButton.addEventListener("click", () => {
  authenticated = false;
  previewMode = true;
  startGame();
});
elements.replayButton.addEventListener("click", startGame);
elements.shareButton.addEventListener("click", shareResult);
elements.allowAnalytics.addEventListener("click", () => {
  setAnalyticsChoice("allow");
  track("analytics_opt_in", { mode: "setting" });
});
elements.declineAnalytics.addEventListener("click", () => setAnalyticsChoice("decline"));
elements.privacySettings.addEventListener("click", () => {
  const erase = window.confirm("Erase your local score, streak, analytics choice, and anonymous installation ID?");
  if (erase) {
    resetAllLocalData();
    window.location.reload();
  } else {
    showConsentDialog();
  }
});

elements.challengeNumber.textContent = `#${challengeNumber(dayKey)}`;
elements.streak.textContent = String(readState().streak?.current || 0);
buildGrid();
initializePi();

if (!analyticsChoice()) {
  window.setTimeout(showConsentDialog, 350);
} else {
  track("session_start", { mode: window.Pi ? "pi_capable" : "web" });
}
