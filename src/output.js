import { hasDifferences } from "./compare.js";

const COLORS = { added: "32", removed: "31", changed: "33", unchanged: "2" };
const MAX_CELL = 40;

const clip = text => {
  const line = text.replace(/[\r\n\t]+/g, " ");
  return line.length > MAX_CELL ? `${line.slice(0, MAX_CELL - 1)}…` : line;
};

/** One line per cell change, one per added or removed row. */
function differenceLines(result) {
  const lines = [];

  for (const row of result.rows) {
    if (row.status === "changed") {
      for (const change of row.changes) {
        lines.push([row.status, ...row.key, change.column, `${clip(change.original)} → ${clip(change.changed)}`]);
      }
    } else if (row.status !== "unchanged") {
      lines.push([row.status, ...row.key, "", ""]);
    }
  }

  return lines;
}

export function formatText(original, changed, result, { color = false, limit = 50, quiet = false } = {}) {
  const paint = (code, text) => (color ? `\x1b[${code}m${text}\x1b[0m` : text);
  const sheet = table => (table.sheet ? paint("2", ` [${table.sheet}]`) : "");
  const { summary, columns } = result;
  const out = [
    `${paint("1", "RowCompare")}  ${original.name}${sheet(original)} → ${changed.name}${sheet(changed)}`,
    `Key: ${result.keys.join(" + ")}   Rows: ${original.rows.length} → ${changed.rows.length}`,
    "",
    "  " +
      [
        paint(COLORS.changed, `${summary.changed} changed`),
        paint(COLORS.added, `${summary.added} added`),
        paint(COLORS.removed, `${summary.removed} removed`),
        paint(COLORS.unchanged, `${summary.unchanged} unchanged`),
      ].join("   "),
  ];

  if (columns.added.length > 0) out.push(`  Columns only in ${changed.name}: ${columns.added.join(", ")}`);
  if (columns.removed.length > 0) out.push(`  Columns only in ${original.name}: ${columns.removed.join(", ")}`);
  if (columns.excluded.length > 0) out.push(`  Excluded: ${columns.excluded.join(", ")}`);
  if (result.emptyKeys > 0) out.push(`  Rows without a key (skipped): ${result.emptyKeys}`);

  if (!hasDifferences(result)) {
    out.push("", paint("32", "No differences."));
    return `${out.join("\n")}\n`;
  }

  const lines = differenceLines(result);

  if (!quiet && limit > 0 && lines.length > 0) {
    const head = ["Status", ...result.keys, "Column", "Original → Changed"];
    const shown = lines.slice(0, limit);
    const widths = head.map((h, i) => Math.max(h.length, ...shown.map(line => clip(line[i]).length)));
    const format = cells => cells.map((cell, i) => clip(cell).padEnd(widths[i])).join("  ").trimEnd();

    out.push("", paint("1", format(head)));

    for (const line of shown) {
      const text = format(line);
      out.push(paint(COLORS[line[0]], line[0]) + text.slice(line[0].length));
    }

    if (lines.length > shown.length) {
      out.push(paint("2", `… ${lines.length - shown.length} more. Use --limit ${lines.length} or --out report.csv for all.`));
    }
  }

  out.push(
    "",
    paint("2", "Visual redline view, Excel reports and matching without a key: https://rowcompare.app"),
  );

  return `${out.join("\n")}\n`;
}

export function toJson(original, changed, result) {
  return {
    original: { file: original.name, sheet: original.sheet, rows: original.rows.length },
    changed: { file: changed.name, sheet: changed.sheet, rows: changed.rows.length },
    keys: result.keys,
    differences: hasDifferences(result),
    summary: result.summary,
    columns: result.columns,
    emptyKeys: result.emptyKeys,
    rows: result.rows.filter(row => row.status !== "unchanged"),
  };
}

const csvField = value => (/[",\r\n]|^\s|\s$/.test(value) ? `"${value.replaceAll('"', '""')}"` : value);

/** Long-format CSV: one line per cell change plus one per added/removed row. UTF-8 with BOM for Excel. */
export function toCsv(result) {
  const lines = [["status", ...result.keys, "column", "original_value", "changed_value"]];

  for (const row of result.rows) {
    if (row.status === "changed") {
      for (const change of row.changes) {
        lines.push([row.status, ...row.key, change.column, change.original, change.changed]);
      }
    } else if (row.status !== "unchanged") {
      lines.push([row.status, ...row.key, "", "", ""]);
    }
  }

  return `﻿${lines.map(line => line.map(csvField).join(",")).join("\r\n")}\r\n`;
}
