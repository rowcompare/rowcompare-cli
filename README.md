# RowCompare CLI

[![npm version](https://img.shields.io/npm/v/rowcompare)](https://www.npmjs.com/package/rowcompare)
[![CI](https://github.com/rowcompare/rowcompare-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/rowcompare/rowcompare-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/rowcompare/rowcompare-cli)](https://github.com/rowcompare/rowcompare-cli/blob/main/LICENSE)

A command line tool that compares two Excel or CSV files by key column and
shows which rows were added, removed and changed. Exit codes make it easy to
use in scripts and CI.

<!-- TODO: replace with a recorded demo GIF. -->
![rowcompare demo](docs/demo.gif)

Built by [RowCompare](https://rowcompare.app), a free tool to compare two
Excel or CSV files in your browser. Your files never leave your computer.

## Usage

```bash
npx rowcompare old.xlsx new.xlsx --key sku
```

```text
RowCompare  products-old.csv → products-new.csv
Key: SKU   Rows: 5 → 5

  2 changed   1 added   1 removed   2 unchanged

Status   SKU    Column  Original → Changed
changed  A-101  Price   149.00 → 139.00
changed  A-102  Stock   0 → 3
removed  A-103
added    A-105
```

Reads `.xlsx`, `.xls`, `.xlsm`, `.ods`, `.csv`, `.tsv` and `.txt`. The first
row of each file is the header.

More examples:

```bash
# Composite key (up to 3 columns)
npx rowcompare jan.csv feb.csv --key Region,Invoice

# Amounts within a cent count as equal; ignore a column
npx rowcompare bank.csv ledger.csv --key Reference --tolerance 0.01 --exclude Notes

# Pick a sheet and save every difference to a file
npx rowcompare a.xlsx b.xlsx --key id --sheet Q3 --out changes.csv
```

## Install

```bash
npm install --global rowcompare
```

Requires Node.js 20 or newer.

## Options

| Option | Description |
| --- | --- |
| `-k, --key <column>` | Key column (required). Repeat or comma-separate for a composite key, up to 3. |
| `-i, --ignore-case` | Ignore upper/lower case. |
| `-t, --tolerance <n>` | Numbers within `n` of each other are equal. |
| `-x, --exclude <column>` | Ignore a column. Repeat or comma-separate. |
| `--no-trim` | Keep leading and trailing spaces (trimmed by default). |
| `--sheet <name\|n>` | Sheet to read in workbooks (default: the first). |
| `-o, --out <file>` | Write all differences to a `.csv` or `.json` file. |
| `--json` | Print a JSON report instead of the table. |
| `-q, --quiet` | Print the summary only. |
| `--limit <n>` | Rows to show in the table (default 50). |
| `--no-color` | Plain output (also honours `NO_COLOR`). |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | No differences |
| `1` | Differences found (rows added, removed or changed, or columns added or removed) |
| `2` | Error (bad arguments, unreadable file, unknown key column) |

```bash
npx rowcompare expected.csv actual.csv --key id --quiet || echo "The data changed"
```

## Need more?

[rowcompare.app](https://rowcompare.app) does more in the browser, free:

- matching rows without a key column, detecting inserted and deleted rows
- suggests the key column and finds the header row for you
- understands currencies, European number formats and dates
- a visual redline view with filters, and styled Excel (.xlsx) reports

## License

MIT. Reading Excel files uses [SheetJS Community Edition](https://sheetjs.com)
(Apache-2.0), installed from the SheetJS CDN; see [NOTICE](NOTICE).
