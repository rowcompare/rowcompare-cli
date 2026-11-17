import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import * as XLSX from "xlsx";

const cliPath = fileURLToPath(new URL("../bin/rowcompare.js", import.meta.url));
const example = name => fileURLToPath(new URL(`../examples/${name}`, import.meta.url));
const OLD = example("products-old.csv");
const NEW = example("products-new.csv");
const SAME = example("products-same.csv");

function cli(args, env = {}) {
  return new Promise(resolve => {
    execFile(process.execPath, [cliPath, ...args], { env: { ...process.env, NO_COLOR: "1", ...env } }, (error, stdout, stderr) => {
      resolve({ code: error ? error.code : 0, stdout, stderr });
    });
  });
}

let directory;
const file = async (name, text) => {
  const path = join(directory, name);
  await writeFile(path, text, "utf8");
  return path;
};

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "rowcompare-"));
});

after(async () => {
  await rm(directory, { force: true, recursive: true });
});

describe("rowcompare CLI", () => {
  it("exits 0 when there are no differences", async () => {
    const { code, stdout } = await cli([OLD, SAME, "--key", "SKU"]);

    assert.equal(code, 0);
    assert.match(stdout, /No differences\./);
  });

  it("exits 1 and prints a table when there are differences", async () => {
    const { code, stdout } = await cli([OLD, NEW, "--key", "sku"]);

    assert.equal(code, 1);
    assert.match(stdout, /2 changed {3}1 added {3}1 removed {3}2 unchanged/);
    assert.match(stdout, /changed {2}A-101 {2}Price {3}149\.00 → 139\.00/);
    assert.match(stdout, /removed {2}A-103/);
    assert.match(stdout, /added {4}A-105/);
    assert.match(stdout, /rowcompare\.app/);
  });

  it("exits 2 on errors", async () => {
    assert.equal((await cli([OLD, NEW])).code, 2);
    assert.equal((await cli([OLD])).code, 2);
    assert.equal((await cli([OLD, join(directory, "missing.csv"), "-k", "SKU"])).code, 2);
    assert.equal((await cli([OLD, NEW, "-k", "SKU", "--frobnicate"])).code, 2);
    assert.equal((await cli([OLD, NEW, "-k", "SKU", "--tolerance", "abc"])).code, 2);
    assert.equal((await cli([OLD, NEW, "-k", "SKU", "--out", "report.pdf"])).code, 2);
    assert.equal((await cli([OLD, await file("notes.doc", "x"), "-k", "SKU"])).code, 2);

    const { code, stderr } = await cli([OLD, NEW, "-k", "Nope"]);
    assert.equal(code, 2);
    assert.match(stderr, /Key column "Nope" is not in either file/);
  });

  it("reads .xlsx sheets and compares them with .csv", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Notes"]]), "Readme");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["SKU", "Price"], ["X1", 10], ["X2", 20]]), "Prices");
    const xlsx = join(directory, "prices.xlsx");
    await writeFile(xlsx, XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
    const csv = await file("prices.csv", "SKU,Price\nX1,10\nX2,25\n");

    const { code, stdout } = await cli([xlsx, csv, "--sheet", "Prices", "-k", "SKU", "--json"]);
    const report = JSON.parse(stdout);

    assert.equal(code, 1);
    assert.equal(report.original.sheet, "Prices");
    assert.deepEqual(report.rows, [{ status: "changed", key: ["X2"], changes: [{ column: "Price", original: "20", changed: "25" }] }]);

    const missing = await cli([xlsx, csv, "--sheet", "Nope", "-k", "SKU"]);
    assert.equal(missing.code, 2);
    assert.match(missing.stderr, /Sheets: Readme, Prices/);
  });

  it("reads .tsv and semicolon CSV", async () => {
    const tsv = await file("a.tsv", "id\tv\n1\ta\n");
    const semicolon = await file("b.csv", "id;v\n1;a\n");

    assert.equal((await cli([tsv, semicolon, "-k", "id"])).code, 0);
  });

  it("writes .csv and .json reports", async () => {
    const csv = join(directory, "report.csv");
    const json = join(directory, "report.json");

    assert.equal((await cli([OLD, NEW, "-k", "SKU", "-q", "--out", csv])).code, 1);
    assert.equal((await cli([OLD, NEW, "-k", "SKU", "-q", "--out", json])).code, 1);

    const csvText = await readFile(csv, "utf8");
    assert.match(csvText, /^﻿status,SKU,column,original_value,changed_value\r\n/);
    assert.match(csvText, /changed,A-101,Price,149\.00,139\.00/);
    assert.equal(JSON.parse(await readFile(json, "utf8")).summary.changed, 2);
  });

  it("--quiet and --limit shorten the output", async () => {
    assert.doesNotMatch((await cli([OLD, NEW, "-k", "SKU", "-q"])).stdout, /Original → Changed/);
    assert.match((await cli([OLD, NEW, "-k", "SKU", "--limit", "1"])).stdout, /… 3 more\./);
  });

  it("colours output only when asked", async () => {
    assert.doesNotMatch((await cli([OLD, NEW, "-k", "SKU"])).stdout, /\x1b\[/);
    assert.match((await cli([OLD, NEW, "-k", "SKU"], { NO_COLOR: "", FORCE_COLOR: "1" })).stdout, /\x1b\[33mchanged/);
  });

  it("prints help and version", async () => {
    const help = await cli(["--help"]);
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

    assert.equal(help.code, 0);
    assert.match(help.stdout, /rowcompare <original> <changed> --key <column>/);
    assert.equal((await cli(["--version"])).stdout.trim(), packageJson.version);
  });
});
