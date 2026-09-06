/**
 * AKINTI i18n leftover check (`docs/I18N.md`).
 *
 * Walks every `.tsx` file under `src/app/**` and `src/components/**` with the
 * TypeScript compiler API and flags two shapes of hardcoded, non-message
 * user-visible text:
 *
 *   1. A JSX text child with a letter in it (`<h1>Nothing new to play yet</h1>`),
 *      including one wrapped in a JSX expression (`{"Nothing new to play yet"}`).
 *   2. A string literal passed to a JSX attribute that is conventionally
 *      user-visible copy (`title`, `label`, `description`, `placeholder`,
 *      `alt`, `aria-label`, `aria-description`).
 *
 * This is a ratchet, not a hard "zero hardcoded strings" gate: full
 * extraction across ~450 files in `src/app`/`src/components` is a large,
 * ongoing migration (see `docs/I18N.md` for what has moved to
 * `src/messages/{tr,en}.json` so far and what has not), and turning this
 * into a hard failure today would break `npm run lint` for the whole
 * repository, including every other agent currently working in it. Instead:
 *
 *   - `scripts/i18n-check.baseline.json` records the current, known set of
 *     files with hardcoded copy and how many instances each has.
 *   - A file with MORE violations than its baseline entry (or a violation in
 *     a file with NO baseline entry at all) fails the check — the ratchet
 *     only tightens.
 *   - A file with fewer violations than baseline (including zero) never
 *     fails; run with `--update-baseline` after migrating a screen to shrink
 *     the baseline to match.
 *
 * Run with `npm run lint` (wired in `package.json`) or directly:
 *   npx tsx scripts/i18n-check.ts
 *   npx tsx scripts/i18n-check.ts --update-baseline
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["src/app", "src/components"];
const BASELINE_PATH = path.join(__dirname, "i18n-check.baseline.json");

/** Dev-only surfaces excluded from the product's user-facing copy rules. */
const EXCLUDED_SEGMENTS = ["/(dev)/", "\\(dev)\\"];

const TEXT_ATTRIBUTES = new Set([
  "title",
  "label",
  "description",
  "placeholder",
  "alt",
  "aria-label",
  "aria-description",
]);

/** Punctuation, numbers, icons-as-text, `&nbsp;`-style entities — nothing worth flagging. */
function hasLetters(value: string): boolean {
  return /\p{L}/u.test(value);
}

function isExcluded(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized.endsWith(".tsx")) return true;
  if (normalized.endsWith(".test.tsx") || normalized.endsWith(".stories.tsx")) return true;
  return EXCLUDED_SEGMENTS.some((segment) => normalized.includes(segment.replace(/\\/g, "/")));
}

function listTsxFiles(dir: string): string[] {
  const absDir = path.join(ROOT, dir);
  if (!existsSync(absDir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsxFiles(path.relative(ROOT, full)));
    } else if (!isExcluded(full)) {
      out.push(full);
    }
  }
  return out;
}

interface Violation {
  line: number;
  snippet: string;
}

function countViolations(filePath: string): Violation[] {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: Violation[] = [];

  function record(node: ts.Node, text: string) {
    const trimmed = text.trim();
    if (!trimmed || !hasLetters(trimmed)) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({ line: line + 1, snippet: trimmed.slice(0, 60) });
  }

  function visit(node: ts.Node) {
    if (ts.isJsxText(node)) {
      record(node, node.getText(sourceFile));
    } else if (ts.isJsxExpression(node) && node.expression && ts.isStringLiteralLike(node.expression)) {
      record(node, node.expression.text);
    } else if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const attrName = node.name.escapedText.toString();
      if (TEXT_ATTRIBUTES.has(attrName) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) {
          record(node.initializer, node.initializer.text);
        } else if (
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression &&
          ts.isStringLiteralLike(node.initializer.expression)
        ) {
          record(node.initializer.expression, node.initializer.expression.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

type Baseline = Record<string, number>;

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE_PATH)) return {};
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

function main() {
  const updateBaseline = process.argv.includes("--update-baseline");
  const files = SCAN_DIRS.flatMap(listTsxFiles);

  const current: Baseline = {};
  const violationsByFile = new Map<string, Violation[]>();
  for (const file of files) {
    const violations = countViolations(file);
    if (violations.length > 0) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      current[rel] = violations.length;
      violationsByFile.set(rel, violations);
    }
  }

  if (updateBaseline) {
    const sorted = Object.fromEntries(Object.entries(current).sort(([a], [b]) => a.localeCompare(b)));
    writeFileSync(BASELINE_PATH, `${JSON.stringify(sorted, null, 2)}\n`);
    console.log(`i18n-check: baseline updated — ${Object.keys(sorted).length} file(s), ${Object.values(sorted).reduce((a, b) => a + b, 0)} instance(s).`);
    return;
  }

  const baseline = loadBaseline();
  const newFiles: string[] = [];
  const regressed: Array<{ file: string; baseline: number; current: number }> = [];
  const improved: string[] = [];

  for (const [file, count] of Object.entries(current)) {
    const baselineCount = baseline[file];
    if (baselineCount === undefined) {
      newFiles.push(file);
    } else if (count > baselineCount) {
      regressed.push({ file, baseline: baselineCount, current: count });
    } else if (count < baselineCount) {
      improved.push(file);
    }
  }
  for (const file of Object.keys(baseline)) {
    if (!(file in current)) improved.push(`${file} (fully migrated)`);
  }

  const totalFiles = Object.keys(current).length;
  const totalInstances = Object.values(current).reduce((a, b) => a + b, 0);
  console.log(`i18n-check: ${totalFiles} file(s) with hardcoded copy, ${totalInstances} instance(s) total (baseline ratchet — see scripts/i18n-check.ts).`);

  if (improved.length > 0) {
    console.log(`i18n-check: ${improved.length} file(s) improved since the baseline was last updated. Run "npx tsx scripts/i18n-check.ts --update-baseline" to record the progress.`);
  }

  if (newFiles.length === 0 && regressed.length === 0) {
    console.log("i18n-check: no new hardcoded copy beyond the recorded baseline.");
    return;
  }

  if (newFiles.length > 0) {
    console.error("\ni18n-check: hardcoded copy in file(s) with no baseline entry:");
    for (const file of newFiles) {
      const sample = violationsByFile.get(file)?.[0];
      console.error(`  ${file} (${current[file]} instance(s))${sample ? ` — e.g. line ${sample.line}: "${sample.snippet}"` : ""}`);
    }
  }
  if (regressed.length > 0) {
    console.error("\ni18n-check: more hardcoded copy than the recorded baseline:");
    for (const { file, baseline: b, current: c } of regressed) {
      console.error(`  ${file}: baseline ${b} -> now ${c}`);
    }
  }
  console.error("\nMove new user-visible strings into src/messages/{tr,en}.json instead of hardcoding them, or run --update-baseline if this is a deliberate, reviewed addition.");
  process.exit(1);
}

main();
