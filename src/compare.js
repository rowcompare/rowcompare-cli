/**
 * Compares two tables by key column(s).
 *
 * @param {{ columns: string[], rows: string[][] }} original
 * @param {{ columns: string[], rows: string[][] }} changed
 * @param {{ keys: string[], trim?: boolean, ignoreCase?: boolean, tolerance?: number, exclude?: string[] }} options
 */
export function compareTables(original, changed, options) {
  const opts = { trim: true, ignoreCase: false, tolerance: 0, exclude: [], ...options };
  const name = column => column.trim().toLowerCase();
  const indexIn = (table, column) => table.columns.findIndex(c => name(c) === name(column));

  if (opts.keys.length === 0) {
    throw new Error("Choose a key column with --key.");
  }

  const keyPairs = opts.keys.map(key => {
    const a = indexIn(original, key);
    const b = indexIn(changed, key);

    if (a === -1 || b === -1) {
      const where = a === -1 && b === -1 ? "either file" : a === -1 ? "the original file" : "the changed file";
      throw new Error(`Key column "${key}" is not in ${where}. Columns: ${(a === -1 ? original : changed).columns.join(", ")}`);
    }

    return [a, b];
  });

  const keyNames = keyPairs.map(([a]) => original.columns[a]);
  const excluded = new Set(opts.exclude.map(name));
  const keySet = new Set(keyNames.map(name));
  const changedNames = new Set(changed.columns.map(name));
  const originalNames = new Set(original.columns.map(name));

  const compared = original.columns
    .map((column, a) => [column, a, indexIn(changed, column)])
    .filter(([column, , b]) => b !== -1 && !keySet.has(name(column)) && !excluded.has(name(column)));

  const keyOf = (row, side) =>
    keyPairs.map(pair => normalize(row[pair[side]] ?? "", opts)).join("\u0001");
  const keyShown = (row, side) => keyPairs.map(pair => (row[pair[side]] ?? "").trim());

  // Rows with the same key pair up in order of appearance.
  const queues = new Map();
  let emptyKeys = 0;

  changed.rows.forEach((row, index) => {
    const key = keyOf(row, 1);

    if (key.replaceAll("\u0001", "") === "") {
      emptyKeys++;
      return;
    }

    if (!queues.has(key)) {
      queues.set(key, []);
    }

    queues.get(key).push(index);
  });

  const used = new Set();
  const rows = [];
  const summary = { added: 0, removed: 0, changed: 0, unchanged: 0 };

  original.rows.forEach(row => {
    const key = keyOf(row, 0);

    if (key.replaceAll("\u0001", "") === "") {
      emptyKeys++;
      return;
    }

    const match = queues.get(key)?.shift();

    if (match === undefined) {
      rows.push({ status: "removed", key: keyShown(row, 0), changes: [] });
      summary.removed++;
      return;
    }

    used.add(match);
    const other = changed.rows[match];
    const changes = compared
      .filter(([, a, b]) => !valuesEqual(row[a] ?? "", other[b] ?? "", opts))
      .map(([column, a, b]) => ({ column, original: row[a] ?? "", changed: other[b] ?? "" }));

    const status = changes.length > 0 ? "changed" : "unchanged";
    rows.push({ status, key: keyShown(row, 0), changes });
    summary[status]++;
  });

  changed.rows.forEach((row, index) => {
    if (!used.has(index) && keyOf(row, 1).replaceAll("\u0001", "") !== "") {
      rows.push({ status: "added", key: keyShown(row, 1), changes: [] });
      summary.added++;
    }
  });

  return {
    keys: keyNames,
    summary,
    rows,
    emptyKeys,
    columns: {
      added: changed.columns.filter(c => !originalNames.has(name(c))),
      removed: original.columns.filter(c => !changedNames.has(name(c))),
      excluded: original.columns.filter(c => excluded.has(name(c)) && changedNames.has(name(c))),
    },
  };
}

/** True when the comparison found added, removed or changed rows, or added or removed columns. */
export function hasDifferences(result) {
  const { added, removed, changed } = result.summary;
  return added + removed + changed + result.columns.added.length + result.columns.removed.length > 0;
}

function normalize(value, opts) {
  let text = opts.trim ? value.trim().replace(/\s+/g, " ") : value;

  if (opts.ignoreCase) {
    text = text.toLowerCase();
  }

  return text;
}

/** Plain numbers like 1234.5, -12 or 1,234.50. Codes with leading zeros (00123) stay text. */
export function parseNumber(value) {
  const text = value.trim();

  if (!/^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(text) || text === "" || /^[-+]?0\d/.test(text)) {
    return null;
  }

  const number = Number(text.replaceAll(",", ""));
  return Number.isFinite(number) ? number : null;
}

function valuesEqual(a, b, opts) {
  const x = parseNumber(a);
  const y = parseNumber(b);

  if (x !== null && y !== null) {
    return Math.abs(x - y) <= opts.tolerance + 1e-9;
  }

  return normalize(a, opts) === normalize(b, opts);
}
