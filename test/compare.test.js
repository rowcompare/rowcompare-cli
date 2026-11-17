import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareTables, hasDifferences, parseNumber } from "../src/compare.js";
import { detectDelimiter, parseDelimited } from "../src/read.js";

const table = (columns, rows) => ({ columns, rows });
const statuses = result => result.rows.map(row => `${row.status}:${row.key.join("|")}`);

describe("compareTables", () => {
  it("pairs rows by key and reports changed cells", () => {
    const a = table(["SKU", "Price"], [["A1", "10"], ["A2", "20"]]);
    const b = table(["sku", "Price"], [["A2", "25"], ["A1", "10"]]);
    const result = compareTables(a, b, { keys: ["SKU"] });

    assert.deepEqual(statuses(result), ["unchanged:A1", "changed:A2"]);
    assert.deepEqual(result.rows[1].changes, [{ column: "Price", original: "20", changed: "25" }]);
    assert.equal(hasDifferences(result), true);
  });

  it("reports added and removed rows", () => {
    const a = table(["id"], [["1"], ["2"]]);
    const b = table(["id"], [["2"], ["3"]]);
    const result = compareTables(a, b, { keys: ["id"] });

    assert.deepEqual(statuses(result), ["removed:1", "unchanged:2", "added:3"]);
    assert.deepEqual(result.summary, { added: 1, removed: 1, changed: 0, unchanged: 1 });
  });

  it("supports a composite key", () => {
    const a = table(["Region", "Code", "Qty"], [["EU", "1", "5"], ["US", "1", "7"]]);
    const b = table(["Region", "Code", "Qty"], [["US", "1", "8"], ["EU", "1", "5"]]);
    const result = compareTables(a, b, { keys: ["Region", "Code"] });

    assert.deepEqual(statuses(result), ["unchanged:EU|1", "changed:US|1"]);
  });

  it("pairs duplicate keys in order and leaves the rest added or removed", () => {
    const a = table(["id", "v"], [["1", "a"], ["1", "b"]]);
    const b = table(["id", "v"], [["1", "a"]]);

    assert.deepEqual(statuses(compareTables(a, b, { keys: ["id"] })), ["unchanged:1", "removed:1"]);
  });

  it("skips rows with an empty key", () => {
    const result = compareTables(table(["id"], [[""], ["1"]]), table(["id"], [["1"]]), { keys: ["id"] });

    assert.equal(result.emptyKeys, 1);
    assert.equal(hasDifferences(result), false);
  });

  it("applies trim, ignoreCase, tolerance and exclude", () => {
    const a = table(["id", "Name", "Amount", "Updated"], [["1", "Acme ", "10.00", "Mon"]]);
    const b = table(["id", "Name", "Amount", "Updated"], [["1", "ACME", "10.004", "Tue"]]);

    assert.equal(hasDifferences(compareTables(a, b, { keys: ["id"] })), true);

    const relaxed = compareTables(a, b, { keys: ["id"], ignoreCase: true, tolerance: 0.01, exclude: ["updated"] });
    assert.equal(hasDifferences(relaxed), false);
    assert.deepEqual(relaxed.columns.excluded, ["Updated"]);
  });

  it("reports columns present on one side only as a difference", () => {
    const result = compareTables(table(["id", "old"], [["1", "x"]]), table(["id", "new"], [["1", "x"]]), { keys: ["id"] });

    assert.deepEqual(result.columns, { added: ["new"], removed: ["old"], excluded: [] });
    assert.equal(hasDifferences(result), true);
  });

  it("throws on a missing key column", () => {
    assert.throws(() => compareTables(table(["id"], []), table(["id"], []), { keys: ["sku"] }), /Key column "sku"/);
  });
});

describe("parseNumber", () => {
  it("reads plain numbers and keeps codes as text", () => {
    assert.equal(parseNumber("1,234.50"), 1234.5);
    assert.equal(parseNumber("-12"), -12);
    assert.equal(parseNumber("0.5"), 0.5);
    assert.equal(parseNumber("00123"), null);
    assert.equal(parseNumber("A-1"), null);
    assert.equal(parseNumber(""), null);
  });
});

describe("delimited text", () => {
  it("handles quoted fields with delimiters, quotes and newlines", () => {
    assert.deepEqual(parseDelimited('a,"b,c","say ""hi""","x\ny"\r\n1,2,3,4', ","), [
      ["a", "b,c", 'say "hi"', "x\ny"],
      ["1", "2", "3", "4"],
    ]);
  });

  it("detects comma, semicolon and tab", () => {
    assert.equal(detectDelimiter("a,b,c\n1,2,3"), ",");
    assert.equal(detectDelimiter("a;b;c\n1,5;2;3"), ";");
    assert.equal(detectDelimiter("a\tb\n1\t2"), "\t");
  });
});
