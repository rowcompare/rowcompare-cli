#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { compareTables, hasDifferences } from "../src/compare.js";
import { formatText, toCsv, toJson } from "../src/output.js";
import { readTable } from "../src/read.js";

const EXIT_SAME = 0;
const EXIT_DIFFERENT = 1;
const EXIT_ERROR = 2;

process.exitCode = await main(process.argv.slice(2));

async function main(argv) {
  let parsed;

  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        key: { type: "string", short: "k", multiple: true },
        "no-trim": { type: "boolean" },
        "ignore-case": { type: "boolean", short: "i" },
        tolerance: { type: "string", short: "t" },
        exclude: { type: "string", short: "x", multiple: true },
        sheet: { type: "string" },
        out: { type: "string", short: "o" },
        json: { type: "boolean" },
        quiet: { type: "boolean", short: "q" },
        limit: { type: "string" },
        "no-color": { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (error) {
    return fail(error.message.replace(/\. To specify.*$/s, "."));
  }

  const { values, positionals } = parsed;

  if (values.help) {
    printHelp();
    return EXIT_SAME;
  }

  if (values.version) {
    const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
    console.log(packageJson.version);
    return EXIT_SAME;
  }

  if (positionals.length !== 2) {
    return fail("Give two files: the original and the changed version.");
  }

  const keys = list(values.key);
  const tolerance = values.tolerance === undefined ? 0 : Number(values.tolerance);
  const limit = values.limit === undefined ? 50 : Number(values.limit);
  const outFormat = values.out?.split(".").pop().toLowerCase();

  if (keys.length === 0) return fail("Choose a key column with --key (rowcompare.app can suggest one for you).");
  if (keys.length > 3) return fail("Use at most 3 key columns.");
  if (!Number.isFinite(tolerance) || tolerance < 0) return fail("--tolerance must be a number ≥ 0.");
  if (!Number.isInteger(limit) || limit < 0) return fail("--limit must be a whole number ≥ 0.");
  if (values.out !== undefined && outFormat !== "csv" && outFormat !== "json") {
    return fail("--out must end in .csv or .json.");
  }

  try {
    const [original, changed] = await Promise.all(
      positionals.map(path => readTable(path, { sheet: values.sheet })),
    );
    const result = compareTables(original, changed, {
      keys,
      trim: !values["no-trim"],
      ignoreCase: Boolean(values["ignore-case"]),
      tolerance,
      exclude: list(values.exclude),
    });

    if (values.out !== undefined) {
      const report =
        outFormat === "csv" ? toCsv(result) : `${JSON.stringify(toJson(original, changed, result), null, 2)}\n`;
      await writeFile(values.out, report, "utf8");
    }

    if (values.json) {
      console.log(JSON.stringify(toJson(original, changed, result), null, 2));
    } else {
      const color = !values["no-color"] && !process.env.NO_COLOR && (Boolean(process.env.FORCE_COLOR) || process.stdout.isTTY);
      process.stdout.write(formatText(original, changed, result, { color, limit, quiet: values.quiet }));

      if (values.out !== undefined) {
        console.log(`Report written to ${values.out}`);
      }
    }

    return hasDifferences(result) ? EXIT_DIFFERENT : EXIT_SAME;
  } catch (error) {
    return fail(error.message, false);
  }
}

/** "--key a --key b" and "--key a,b" both give ["a", "b"]. */
function list(values = []) {
  return values.flatMap(value => value.split(",")).map(value => value.trim()).filter(Boolean);
}

function fail(message, showUsageHint = true) {
  console.error(`rowcompare: ${message}`);

  if (showUsageHint) {
    console.error("Run `rowcompare --help` for usage.");
  }

  return EXIT_ERROR;
}

function printHelp() {
  console.log(`Usage:
  rowcompare <original> <changed> --key <column> [options]

Compares two spreadsheets (.xlsx .xls .xlsm .ods .csv .tsv .txt) by key column
and shows which rows were added, removed and changed.

Options:
  -k, --key <column>      Key column; repeat or comma-separate for a composite key (up to 3)
  -i, --ignore-case       Ignore upper/lower case
  -t, --tolerance <n>     Numbers within n of each other are equal
  -x, --exclude <column>  Ignore a column; repeat or comma-separate
      --no-trim           Keep leading and trailing spaces (trimmed by default)
      --sheet <name|n>    Sheet to read in workbooks (default: the first)
  -o, --out <file>        Write all differences to a .csv or .json file
      --json              Print a JSON report instead of the table
  -q, --quiet             Print the summary only
      --limit <n>         Rows to show in the table (default 50)
      --no-color          Plain output (also honours NO_COLOR)
  -v, --version           Print the version
  -h, --help              Show this help message

Exit codes:
  0  no differences   1  differences found   2  error

Examples:
  npx rowcompare old.xlsx new.xlsx --key sku
  npx rowcompare bank.csv ledger.csv --key Reference --tolerance 0.01
  npx rowcompare jan.csv feb.csv --key Region,Invoice --out changes.csv

For a visual redline view, styled Excel reports and matching without a key,
use https://rowcompare.app (free, files stay on your computer).`);
}
