import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import * as XLSX from "xlsx";

export const TEXT_EXTENSIONS = [".csv", ".tsv", ".txt"];
export const WORKBOOK_EXTENSIONS = [".xlsx", ".xls", ".xlsm", ".ods"];

export class InputError extends Error {}

/**
 * Reads a spreadsheet file into { name, sheet, columns, rows }.
 * The first non-empty row is the header. Every value is a string.
 */
export async function readTable(path, { sheet } = {}) {
  const ext = extname(path).toLowerCase();

  if (!TEXT_EXTENSIONS.includes(ext) && !WORKBOOK_EXTENSIONS.includes(ext)) {
    throw new InputError(
      `${basename(path)}: unsupported file type. Use .xlsx, .xls, .xlsm, .ods, .csv, .tsv or .txt.`,
    );
  }

  let bytes;

  try {
    bytes = await readFile(path);
  } catch (error) {
    throw new InputError(
      error.code === "ENOENT" ? `File not found: ${path}` : `Can't read ${path}: ${error.message}`,
    );
  }

  if (TEXT_EXTENSIONS.includes(ext)) {
    const text = decode(bytes);
    const delimiter = ext === ".tsv" ? "\t" : detectDelimiter(text);
    return toTable(basename(path), null, parseDelimited(text, delimiter));
  }

  let workbook;

  try {
    workbook = XLSX.read(bytes, { type: "buffer" });
  } catch {
    throw new InputError(`${basename(path)} isn't a readable spreadsheet.`);
  }

  const sheetName = pickSheet(workbook, sheet, basename(path));
  const grid = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
    header: 1,
    raw: false,
    defval: "",
    blankrows: false,
  });

  return toTable(basename(path), sheetName, grid);
}

function pickSheet(workbook, wanted, fileName) {
  const names = workbook.SheetNames;

  if (wanted === undefined) {
    return names[0];
  }

  const byName = names.find(name => name.toLowerCase() === wanted.toLowerCase());

  if (byName) {
    return byName;
  }

  if (/^\d+$/.test(wanted) && Number(wanted) >= 1 && Number(wanted) <= names.length) {
    return names[Number(wanted) - 1];
  }

  throw new InputError(`${fileName} has no sheet "${wanted}". Sheets: ${names.join(", ")}`);
}

function toTable(name, sheet, grid) {
  const rows = grid
    .map(row => row.map(value => (value === null || value === undefined ? "" : String(value))))
    .filter(row => row.some(value => value.trim() !== ""));

  if (rows.length === 0) {
    throw new InputError(`${name} has no data.`);
  }

  const [header, ...body] = rows;
  const width = Math.max(...rows.map(row => row.length));
  const columns = Array.from({ length: width }, (_, i) => (header[i] ?? "").trim() || `Column ${i + 1}`);

  return {
    name,
    sheet,
    columns,
    rows: body.map(row => Array.from({ length: width }, (_, i) => row[i] ?? "")),
  };
}

/** UTF-8, falling back to Windows-1252 (Excel's legacy CSV encoding). */
function decode(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Picks comma, semicolon or tab from the first line. */
export function detectDelimiter(text) {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0];
  const counts = [",", ";", "\t"].map(d => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** RFC 4180 parser: quoted fields may contain delimiters, quotes and newlines. */
export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  for (; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field === "") {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") {
        i++;
      }

      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
