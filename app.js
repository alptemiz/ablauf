const STORAGE_KEY = "flashcardProgressExcelV1";

let allCards = [];
let currentCards = [];
let index = 0;
let front = true;
let progress = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};

function getState(card) {
  if (!progress[card.id]) {
    progress[card.id] = {
      shown: 0,
      again: 0,
      good: 0,
      penalty: 0,
      lastResult: "new"
    };
  }

  return progress[card.id];
}

function saveProgress() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function getAnswerTotal(card) {
  const state = getState(card);
  return state.again + state.good;
}

function getAgainRate(card) {
  const state = getState(card);
  const total = getAnswerTotal(card);

  if (total === 0) return 0;

  return state.again / total;
}

function calculatePenalty(card) {
  const state = getState(card);
  const answerTotal = getAnswerTotal(card);
  const againRate = getAgainRate(card);

  if (answerTotal === 0) return 0;

  return state.again * 8 - state.good * 3 + againRate * 12;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
    const penaltyA = calculatePenalty(a);
    const penaltyB = calculatePenalty(b);

    if (penaltyA !== penaltyB) return penaltyB - penaltyA;

    const answerTotalA = getAnswerTotal(a);
    const answerTotalB = getAnswerTotal(b);

    if (answerTotalA !== answerTotalB) return answerTotalA - answerTotalB;

    return getState(a).shown - getState(b).shown;
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

    state.shown++;
    state.penalty = calculatePenalty(card);

    saveProgress();
  }

  renderCard();
}

function renderEmptyCard() {
  document.getElementById("card").className = "card front";
  document.getElementById("cardMeta").textContent = "0 / 0";
  document.getElementById("step").textContent = "";
  document.getElementById("questionText").textContent = "Keine Karten gefunden";
  document.getElementById("answerText").textContent = "";
  document.getElementById("score").textContent = scoreText();
}

function renderCard() {
  const card = currentCards[index];

  document.getElementById("card").className = front ? "card front" : "card back";
  document.getElementById("cardMeta").textContent = `${index + 1} / ${currentCards.length} | ${card.category}`;
  document.getElementById("step").textContent = card.step || "";
  document.getElementById("questionText").innerHTML = escapeHtml(card.fachbegriff);
  document.getElementById("answerText").innerHTML = escapeHtml(card.laiensprache);
  document.getElementById("score").textContent = scoreText();
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
  state.penalty = calculatePenalty(card);

  saveProgress();
  reorderByLearningPriority();

  const cardIndex = currentCards.findIndex(x => x.id === card.id);

  if (cardIndex >= 0) {
    currentCards.splice(cardIndex, 1);
    currentCards.push(card);
  }

  index = 0;
  front = true;

  showCurrentCard(true);
}

function resetProgress() {
  progress = {};
  saveProgress();
  applyFilters();
}

function exportProgress() {
  const exportData = {
    type: "FAMED_FLASHCARD_PROGRESS",
    version: 1,
    exportedAt: new Date().toISOString(),
    storageKey: STORAGE_KEY,
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
      lastResult: state.lastResult || "new"
    };
  });

  return cleaned;
}

async function importProgressFromFile(file) {
  try {
    if (!file) return;

    const text = await file.text();
    const data = JSON.parse(text);
    progress = normalizeImportedProgress(data);

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

document.addEventListener("DOMContentLoaded", loadDefaultExcel);
