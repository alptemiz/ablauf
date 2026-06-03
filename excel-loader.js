const EXCEL_SOURCE = "ablauf.xlsx";

function normalizeCell(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function normalizeHeader(value) {
  return normalizeCell(value)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function slugify(value) {
  return normalizeHeader(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function looksLikeHeader(row) {
  const headers = row.map(normalizeHeader);
  const known = [
    "kategorie", "category", "eingriff", "operation", "untersuchung",
    "schritt", "step", "ablaufschritt", "fachbegriff", "nominalstil",
    "laiensprache", "patientensprache", "satz", "patientensatz"
  ];

  return headers.some(header => known.includes(header));
}

function findColumnIndex(headers, candidates, fallbackIndex) {
  const normalizedCandidates = candidates.map(normalizeHeader);
  const exactIndex = headers.findIndex(header => normalizedCandidates.includes(header));

  if (exactIndex >= 0) return exactIndex;

  const partialIndex = headers.findIndex(header =>
    normalizedCandidates.some(candidate => header.includes(candidate))
  );

  return partialIndex >= 0 ? partialIndex : fallbackIndex;
}

function rowsToFlashcards(rows) {
  const cleanRows = rows
    .filter(row => row && row.some(cell => normalizeCell(cell) !== ""));

  if (cleanRows.length === 0) return [];

  const hasHeader = looksLikeHeader(cleanRows[0]);
  const headers = hasHeader ? cleanRows[0].map(normalizeHeader) : [];
  const dataRows = hasHeader ? cleanRows.slice(1) : cleanRows;

  const categoryIndex = hasHeader
    ? findColumnIndex(headers, ["eingriff", "kategorie", "category", "operation", "untersuchung"], 0)
    : 0;

  const stepIndex = hasHeader
    ? findColumnIndex(headers, ["schritt", "step", "ablaufschritt", "abschnitt"], 1)
    : 1;

  const frontIndex = hasHeader
    ? findColumnIndex(headers, ["nominalstil", "fachbegriff", "medizinisch", "quelle", "ablauf"], 2)
    : 2;

  const backIndex = hasHeader
    ? findColumnIndex(headers, ["patientensprache", "laiensprache", "patientensatz", "satz", "erklaerung", "aufklaerung"], 3)
    : 3;

  return dataRows.map((row, position) => {
    const category = normalizeCell(row[categoryIndex]);
    const step = normalizeCell(row[stepIndex]);
    const fachbegriff = normalizeCell(row[frontIndex]);
    const laiensprache = normalizeCell(row[backIndex]);

    if (!category || !fachbegriff || !laiensprache) return null;

    return {
      id: `${slugify(category)}__${slugify(step)}__${slugify(fachbegriff)}__${position}`,
      category,
      step,
      fachbegriff,
      laiensprache,
      satz: step
    };
  }).filter(Boolean);
}

async function readWorkbookFromUrl(url = EXCEL_SOURCE) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Excel-Datei konnte nicht geladen werden: ${url}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return XLSX.read(arrayBuffer, { type: "array" });
}

async function readWorkbookFromFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  return XLSX.read(arrayBuffer, { type: "array" });
}

function workbookToFlashcards(workbook) {
  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("Die Excel-Datei enthält kein Arbeitsblatt.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false
  });

  const cards = rowsToFlashcards(rows);

  if (cards.length === 0) {
    throw new Error("In der Excel-Datei wurden keine gültigen Karten gefunden.");
  }

  return cards;
}

async function loadFlashcardsFromExcel(url = EXCEL_SOURCE) {
  if (typeof XLSX === "undefined") {
    throw new Error("SheetJS wurde nicht geladen. Prüfe die Internetverbindung oder binde xlsx.full.min.js lokal ein.");
  }

  const workbook = await readWorkbookFromUrl(url);
  return workbookToFlashcards(workbook);
}

async function loadFlashcardsFromExcelFile(file) {
  if (!file) return [];

  if (typeof XLSX === "undefined") {
    throw new Error("SheetJS wurde nicht geladen. Prüfe die Internetverbindung oder binde xlsx.full.min.js lokal ein.");
  }

  const workbook = await readWorkbookFromFile(file);
  return workbookToFlashcards(workbook);
}
