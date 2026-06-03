const STORAGE_KEY = "flashcardProgressExcelV1";
const TURN_KEY = `${STORAGE_KEY}_studyTurn`;

let allCards = [];
let currentCards = [];
let index = 0;
let front = true;
let progress = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
let studyTurn = Number(localStorage.getItem(TURN_KEY)) || 0;

let lastCardTapAt = 0;

function handleCardTap(event) {
  if (currentCards.length === 0) return;

  const target = event.target;
  if (target && target.closest && target.closest("button, a, input, select, textarea, label")) {
    return;
  }

  const now = Date.now();
  if (now - lastCardTapAt < 220) return;
  lastCardTapAt = now;

  if (event.cancelable) event.preventDefault();
  flipCard();
}

function setupCardTap() {
  const cardElement = document.getElementById("card");
  if (!cardElement) return;

  if (window.PointerEvent) {
    cardElement.addEventListener("pointerup", handleCardTap, { passive: false });
  } else {
    cardElement.addEventListener("touchend", handleCardTap, { passive: false });
    cardElement.addEventListener("click", handleCardTap, { passive: false });
  }
}

function getState(card) {
  if (!progress[card.id]) {
    progress[card.id] = {
      shown: 0,
      again: 0,
      good: 0,
      penalty: 0,
      lastResult: "new",
      lastSeenTurn: 0,
      dueAfterTurn: 0
    };
  }

  const state = progress[card.id];

  state.shown = Number(state.shown) || 0;
  state.again = Number(state.again) || 0;
  state.good = Number(state.good) || 0;
  state.penalty = Number(state.penalty) || 0;
  state.lastResult = state.lastResult || "new";
  state.lastSeenTurn = Number(state.lastSeenTurn) || 0;
  state.dueAfterTurn = Number(state.dueAfterTurn) || 0;

  return state;
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  localStorage.setItem(TURN_KEY, String(studyTurn));
}

function getAnswerTotal(card) {
  const state = getState(card);
  return state.again + state.good;
}

function isCoolingDown(card) {
  const state = getState(card);
  return state.dueAfterTurn > studyTurn;
}

function getCooldownWait(card) {
  const state = getState(card);
  return Math.max(0, state.dueAfterTurn - studyTurn);
}

function getCooldownLength(result) {
  const visibleCount = Math.max(currentCards.length, 1);

  if (result === "again") {
    return Math.min(8, Math.max(3, Math.round(visibleCount * 0.06)));
  }

  if (result === "good") {
    return Math.min(22, Math.max(8, Math.round(visibleCount * 0.18)));
  }

  return 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function calculatePenalty(card) {
  const state = getState(card);
  const age = state.lastSeenTurn > 0
    ? Math.max(0, studyTurn - state.lastSeenTurn)
    : 0;

  const againPressure = state.again * 3.6;
  const goodReduction = state.good * 2.3;
  const exposureReduction = Math.min(state.shown * 0.6, 3.2);
  const ageBonus = Math.min(age * 0.25, 2.4);

  const rawPenalty = 5 + againPressure - goodReduction - exposureReduction + ageBonus;

  return clamp(rawPenalty, 1, 9);
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderAblaufContext(card) {
  const contextElement = document.getElementById("ablaufContext");
  if (!contextElement) return;

  const ablaufCards = allCards
    .filter(item => item.category === card.category)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

  contextElement.title = ablaufCards.map(item => item.fachbegriff).join("; ");

  contextElement.innerHTML = ablaufCards.map((item, position) => {
    const text = escapeHtml(item.fachbegriff);
    const separator = position < ablaufCards.length - 1 ? "; " : "";
    const cssClass = item.id === card.id ? "ablauf-current" : "";

    return `<span class="${cssClass}">${text}</span>${separator}`;
  }).join("");
}

function setSourceStatus(text, isError = false) {
  const sourceStatus = document.getElementById("sourceStatus");
  if (!sourceStatus) return;

  sourceStatus.textContent = text;
  sourceStatus.className = isError ? "source-status error" : "source-status";
}

function buildCategorySelect() {
  const select = document.getElementById("category");

  const categories = [
    "Alle",
    ...new Set(allCards.map(card => card.category))
  ];

  select.innerHTML = categories
    .map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`)
    .join("");
}

function applyFilters() {
  const selectedCategory = document.getElementById("category").value;
  const searchTerm = document.getElementById("search").value.toLowerCase();

  currentCards = allCards.filter(card => {
    const matchesCategory =
      selectedCategory === "Alle" || card.category === selectedCategory;

    const searchableText = [
      card.category,
      card.step,
      card.fachbegriff,
      card.laiensprache
    ].join(" ").toLowerCase();

    return matchesCategory && searchableText.includes(searchTerm);
  });

  reorderByLearningPriority();

  index = 0;
  front = true;
  showCurrentCard(true);
}

function reorderByLearningPriority() {
  currentCards.sort((a, b) => {
    const coolingA = isCoolingDown(a);
    const coolingB = isCoolingDown(b);

    if (coolingA !== coolingB) return coolingA ? 1 : -1;

    if (coolingA && coolingB) {
      const waitA = getCooldownWait(a);
      const waitB = getCooldownWait(b);
      if (waitA !== waitB) return waitA - waitB;
    }

    const penaltyA = calculatePenalty(a);
    const penaltyB = calculatePenalty(b);

    if (penaltyA !== penaltyB) return penaltyB - penaltyA;

    const stateA = getState(a);
    const stateB = getState(b);

    if (stateA.shown !== stateB.shown) return stateA.shown - stateB.shown;
    if (stateA.again !== stateB.again) return stateB.again - stateA.again;
    if (stateA.good !== stateB.good) return stateA.good - stateB.good;

    return a.id.localeCompare(b.id);
  });
}

function showCurrentCard(countShown = false) {
  if (currentCards.length === 0) {
    renderEmptyCard();
    return;
  }

  if (countShown && front) {
    const card = currentCards[index];
    const state = getState(card);

    studyTurn++;
    state.shown++;
    state.lastSeenTurn = studyTurn;
    state.penalty = calculatePenalty(card);

    saveProgress();
  }

  renderCard();
}

function renderEmptyCard() {
  document.getElementById("card").className = "card front";
  document.getElementById("cardMeta").textContent = "0 / 0";
  document.getElementById("cardProgress").textContent = "";
  document.getElementById("step").textContent = "";
  document.getElementById("ablaufContext").textContent = "";
  document.getElementById("questionText").textContent = "Keine Karten gefunden";
  document.getElementById("answerText").textContent = "";
  const scoreElement = document.getElementById("score");
  if (scoreElement) scoreElement.textContent = scoreText();
}

function renderCard() {
  const card = currentCards[index];
  const state = getState(card);
  const penalty = calculatePenalty(card);

  document.getElementById("card").className = front ? "card front" : "card back";
  const categoryOrder = Number(card.categoryOrder) || index + 1;
  const categoryTotal = Number(card.categoryTotal) || currentCards.length;

  document.getElementById("cardMeta").textContent = `${categoryOrder} / ${categoryTotal} | ${card.category}`;
  document.getElementById("cardProgress").textContent =
    `◉ ${state.shown} · ↓ ${state.good} · ↑ ${state.again} · ⚑ ${penalty.toFixed(0)}`;
  document.getElementById("step").textContent = card.step || "";
  renderAblaufContext(card);
  document.getElementById("questionText").innerHTML = escapeHtml(card.fachbegriff);
  document.getElementById("answerText").innerHTML = escapeHtml(card.laiensprache);
  const scoreElement = document.getElementById("score");
  if (scoreElement) scoreElement.textContent = scoreText();
}

function scoreText() {
  let shownTotal = 0;
  let againTotal = 0;
  let goodTotal = 0;

  allCards.forEach(card => {
    const state = getState(card);

    shownTotal += state.shown;
    againTotal += state.again;
    goodTotal += state.good;
  });

  return `Gezeigt: ${shownTotal} | Wiederholen: ${againTotal} | Gewusst: ${goodTotal}`;
}

function flipCard() {
  if (currentCards.length === 0) return;
  front = !front;
  renderCard();
}

function nextCard() {
  if (currentCards.length === 0) return;

  index = (index + 1) % currentCards.length;
  front = true;

  showCurrentCard(true);
}

function previousCard() {
  if (currentCards.length === 0) return;

  index = (index - 1 + currentCards.length) % currentCards.length;
  front = true;

  showCurrentCard(true);
}

function markAgain() {
  if (currentCards.length === 0) return;

  const card = currentCards[index];
  const state = getState(card);

  state.again++;
  state.lastResult = "again";
  state.dueAfterTurn = studyTurn + getCooldownLength("again");
  state.penalty = calculatePenalty(card);

  saveProgress();
  reorderByLearningPriority();

  index = 0;
  front = true;

  showCurrentCard(true);
}

function markGood() {
  if (currentCards.length === 0) return;

  const card = currentCards[index];
  const state = getState(card);

  state.good++;
  state.lastResult = "good";
  state.dueAfterTurn = studyTurn + getCooldownLength("good");
  state.penalty = calculatePenalty(card);

  saveProgress();
  reorderByLearningPriority();

  index = 0;
  front = true;

  showCurrentCard(true);
}

function resetProgress() {
  progress = {};
  studyTurn = 0;
  saveProgress();
  applyFilters();
}

function exportProgress() {
  const exportData = {
    type: "FAMED_FLASHCARD_PROGRESS",
    exportedAt: new Date().toISOString(),
    storageKey: STORAGE_KEY,
    studyTurn,
    progress
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: "application/json"
  });

  const date = new Date().toISOString().slice(0, 10);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `famed_flashcard_progress_${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function normalizeImportedProgress(data) {
  const rawProgress = data && data.progress && typeof data.progress === "object"
    ? data.progress
    : data;

  if (!rawProgress || typeof rawProgress !== "object" || Array.isArray(rawProgress)) {
    throw new Error("Die Import-Datei enthält keine gültigen Lerndaten.");
  }

  const cleaned = {};

  Object.entries(rawProgress).forEach(([cardId, state]) => {
    if (!state || typeof state !== "object") return;

    cleaned[cardId] = {
      shown: Number(state.shown) || 0,
      again: Number(state.again) || 0,
      good: Number(state.good) || 0,
      penalty: Number(state.penalty) || 0,
      lastResult: state.lastResult || "new",
      lastSeenTurn: Number(state.lastSeenTurn) || 0,
      dueAfterTurn: Number(state.dueAfterTurn) || 0
    };
  });

  return cleaned;
}

function inferStudyTurnFromProgress(cleanedProgress) {
  return Object.values(cleanedProgress).reduce((maxTurn, state) => {
    return Math.max(maxTurn, Number(state.lastSeenTurn) || 0, Number(state.dueAfterTurn) || 0);
  }, 0);
}

async function importProgressFromFile(file) {
  try {
    if (!file) return;

    const text = await file.text();
    const data = JSON.parse(text);
    const cleaned = normalizeImportedProgress(data);

    progress = cleaned;
    studyTurn = Number(data.studyTurn) || inferStudyTurnFromProgress(cleaned);

    saveProgress();
    applyFilters();
    setSourceStatus("Lerndaten importiert.");
  } catch (error) {
    setSourceStatus(error.message, true);
    console.error(error);
  } finally {
    const input = document.getElementById("progressImportFile");
    if (input) input.value = "";
  }
}

function setCards(cards, sourceLabel) {
  allCards = cards;
  currentCards = [];
  index = 0;
  front = true;

  buildCategorySelect();
  applyFilters();
  setSourceStatus(`${cards.length} Karten aus ${sourceLabel} geladen.`);
}

async function loadDefaultExcel() {
  try {
    setSourceStatus("Lade Excel-Datei: ablauf.xlsx ...");
    const cards = await loadFlashcardsFromExcel(EXCEL_SOURCE);
    setCards(cards, "ablauf.xlsx");
  } catch (error) {
    setSourceStatus(
      "ablauf.xlsx konnte nicht automatisch geladen werden. Öffne die Seite über einen lokalen Server oder wähle die Excel-Datei manuell aus.",
      true
    );
    console.error(error);
    renderEmptyCard();
  }
}

async function loadExcelFromFile(file) {
  try {
    if (!file) return;
    setSourceStatus(`Lade Excel-Datei: ${file.name} ...`);
    const cards = await loadFlashcardsFromExcelFile(file);
    setCards(cards, file.name);
  } catch (error) {
    setSourceStatus(error.message, true);
    console.error(error);
  }
}

document.addEventListener("keydown", function(event) {
  if (event.key === " ") {
    event.preventDefault();
    flipCard();
  }

  if (event.key === "ArrowRight") nextCard();
  if (event.key === "ArrowLeft") previousCard();

  if (event.key === "ArrowUp") {
    event.preventDefault();
    markAgain();
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    markGood();
  }
});

document.addEventListener("DOMContentLoaded", function() {
  setupCardTap();
  loadDefaultExcel();
});
