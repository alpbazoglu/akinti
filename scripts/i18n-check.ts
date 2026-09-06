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

/**
 * Server-side surfaces (`docs/I18N.md`, i18n-c stage): every Server Action's
 * `formError`/`message`/`fieldErrors` string and every Zod validation
 * message must be a `"namespace.key"` message key, resolved with
 * `getTranslations()`/`translateFieldErrors` at the action boundary — never
 * a hardcoded English sentence, the same rule the `.tsx` scanner above
 * enforces for JSX copy. Unlike that scanner, this one has NO baseline
 * ratchet: by the time this shipped, every file in `SERVER_SCAN_DIRS` was
 * already fully migrated, so any hit here is a real regression, not
 * pre-existing debt — `main()` fails the moment `SERVER_FILE_PATTERN` finds
 * one, independent of `scripts/i18n-check.baseline.json`.
 */
const SERVER_SCAN_DIRS = ["src/app", "src/lib/moderation", "src/lib/validation", "src/lib/push", "src/config"];
/** Only actions.ts under src/app; every .ts file under the other four (their .tsx components are already covered by the scanner above). */
function isServerScanTarget(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  if (!normalized.endsWith(".ts")) return false;
  if (normalized.endsWith(".test.ts")) return false;
  if (normalized.includes("/src/app/")) return normalized.endsWith("/actions.ts");
  return true;
}
/** A `"Namespace.key"` (optionally `:param`) message-key reference — the intended, non-hardcoded shape for every string this scanner inspects. */
const MESSAGE_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+(:[^\s]*)?$/;

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

const VALIDATION_MESSAGE_METHODS = new Set(["min", "max", "regex", "email", "url"]);

/**
 * Hardcoded-copy scan for a server-side `.ts` file: every string literal
 * assigned to a `formError`/`message`/`fieldErrors`-member property, and
 * every string literal in the validation-message position of a Zod
 * `.min/.max/.regex/.email/.url(...)` call — flagged unless it is a
 * `"Namespace.key"` message-key reference (`MESSAGE_KEY_PATTERN`).
 */
function countServerViolations(filePath: string): Violation[] {
  const source = readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const violations: Violation[] = [];

  // `src/config/**` is a catalog of plain constants (`TERMS.message` is the
  // "Message" button/nav label, not a Server Action result) — checking the
  // `message` property name there would flag legitimate, unrelated
  // vocabulary. `formError`/`fieldErrors` never collide this way, so those
  // stay checked everywhere; config's Zod-message-call-argument surface (the
  // other half of this scan) is unaffected, since no Zod schemas live there.
  const isConfigFile = filePath.replace(/\\/g, "/").includes("/src/config/");
  const objectPropertyNames = isConfigFile ? ["formError", "fieldErrors"] : ["formError", "message", "fieldErrors"];

  function record(node: ts.Node, text: string) {
    if (!hasLetters(text) || MESSAGE_KEY_PATTERN.test(text)) return;
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({ line: line + 1, snippet: text.trim().slice(0, 60) });
  }

  function checkStringLiteralProperty(node: ts.ObjectLiteralExpression, names: readonly string[]) {
    for (const prop of node.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const name = prop.name.getText(sourceFile).replace(/^["']|["']$/g, "");
      if (!names.includes(name)) continue;
      if (ts.isStringLiteralLike(prop.initializer)) {
        record(prop.initializer, prop.initializer.text);
      } else if (name === "fieldErrors" && ts.isObjectLiteralExpression(prop.initializer)) {
        for (const inner of prop.initializer.properties) {
          if (ts.isPropertyAssignment(inner) && ts.isStringLiteralLike(inner.initializer)) {
            record(inner.initializer, inner.initializer.text);
          }
        }
      }
    }
  }

  function visit(node: ts.Node) {
    if (ts.isObjectLiteralExpression(node)) {
      checkStringLiteralProperty(node, objectPropertyNames);
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      VALIDATION_MESSAGE_METHODS.has(node.expression.name.text) &&
      node.arguments.length >= 2
    ) {
      const messageArg = node.arguments[node.arguments.length - 1];
      if (messageArg && ts.isStringLiteralLike(messageArg)) {
        record(messageArg, messageArg.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}

function listServerFiles(dir: string): string[] {
  const absDir = path.join(ROOT, dir);
  if (!existsSync(absDir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    const full = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listServerFiles(path.relative(ROOT, full)));
    } else if (isServerScanTarget(full)) {
      out.push(full);
    }
  }
  return out;
}

const MESSAGE_FILES = ["src/messages/en.json", "src/messages/tr.json"];
/** DESIGN.md §12.22 bans the em dash in any user-visible string (review3 finding 22). */
const EM_DASH = "—";

/** Walks every string leaf of a parsed messages JSON tree, calling `visit(path, value)` for each. */
function walkMessageStrings(value: unknown, keyPath: string, visit: (keyPath: string, value: string) => void): void {
  if (typeof value === "string") {
    visit(keyPath, value);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      walkMessageStrings(child, keyPath ? `${keyPath}.${key}` : key, visit);
    }
  }
}

/** Zero-tolerance em-dash scan over `src/messages/{en,tr}.json` — no baseline, no ratchet. */
function checkEmDash(): boolean {
  let clean = true;
  for (const relPath of MESSAGE_FILES) {
    const absPath = path.join(ROOT, relPath);
    if (!existsSync(absPath)) continue;
    const parsed = JSON.parse(readFileSync(absPath, "utf8")) as unknown;
    walkMessageStrings(parsed, "", (keyPath, value) => {
      if (value.includes(EM_DASH)) {
        if (clean) console.error("\ni18n-check: em dash found in user-visible copy (DESIGN.md §12.22 bans it):");
        console.error(`  ${relPath}#${keyPath} — "${value}"`);
        clean = false;
      }
    });
  }
  if (clean) {
    console.log(`i18n-check: no em dash in ${MESSAGE_FILES.join(", ")}.`);
  } else {
    console.error("\nReplace the em dash with a middle dot or a full stop.");
  }
  return clean;
}

/**
 * Key-set diff between `src/messages/en.json` and `tr.json` (review3
 * finding 26): `src/i18n/global.ts`'s doc comment claims `tr.json` "must
 * have the exact same keys as en.json by convention, checked by
 * scripts/i18n-check.ts" — nothing actually did until now. A key missing
 * from `tr.json` renders next-intl's `getMessageFallback` (the raw key
 * path) to a Turkish reader with no build or test failure, so this has no
 * baseline: any asymmetry is a real regression.
 */
function checkKeyParity(): boolean {
  const enPath = path.join(ROOT, "src/messages/en.json");
  const trPath = path.join(ROOT, "src/messages/tr.json");
  if (!existsSync(enPath) || !existsSync(trPath)) return true;

  const enKeys = new Set<string>();
  const trKeys = new Set<string>();
  walkMessageStrings(JSON.parse(readFileSync(enPath, "utf8")), "", (keyPath) => enKeys.add(keyPath));
  walkMessageStrings(JSON.parse(readFileSync(trPath, "utf8")), "", (keyPath) => trKeys.add(keyPath));

  const missingFromTr = [...enKeys].filter((key) => !trKeys.has(key)).sort();
  const missingFromEn = [...trKeys].filter((key) => !enKeys.has(key)).sort();

  if (missingFromTr.length === 0 && missingFromEn.length === 0) {
    console.log(`i18n-check: en.json and tr.json have the same ${enKeys.size} key(s).`);
    return true;
  }

  console.error("\ni18n-check: src/messages/en.json and tr.json key sets do not match:");
  for (const key of missingFromTr) console.error(`  missing from tr.json: ${key}`);
  for (const key of missingFromEn) console.error(`  missing from en.json: ${key}`);
  return false;
}

type Baseline = Record<string, number>;

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE_PATH)) return {};
  return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
}

/** Runs independently of the `.tsx` ratchet/`--update-baseline` — see this constant's own doc comment. Returns `true` if the server-side surfaces are clean. */
function checkServerSurfaces(): boolean {
  const files = SERVER_SCAN_DIRS.flatMap(listServerFiles);
  const violationsByFile = new Map<string, Violation[]>();
  let totalInstances = 0;

  for (const file of files) {
    const violations = countServerViolations(file);
    if (violations.length > 0) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      violationsByFile.set(rel, violations);
      totalInstances += violations.length;
    }
  }

  if (violationsByFile.size === 0) {
    console.log(
      `i18n-check: server-side surfaces clean — 0 hardcoded formError/message/fieldErrors/Zod strings across ${files.length} file(s) (src/app/**/actions.ts, src/lib/moderation, src/lib/validation, src/lib/push, src/config).`,
    );
    return true;
  }

  console.error(
    `\ni18n-check: hardcoded copy in ${violationsByFile.size} server-side file(s), ${totalInstances} instance(s) — this surface has no baseline, every hit is a regression:`,
  );
  for (const [file, violations] of violationsByFile) {
    for (const violation of violations) {
      console.error(`  ${file}:${violation.line} — "${violation.snippet}"`);
    }
  }
  console.error(
    '\nMove the string into src/messages/{tr,en}.json and reference it as a "namespace.key" (translateFieldErrors/getTranslations), or as a Zod message key resolved via translateValidationMessage.',
  );
  return false;
}

function main() {
  const updateBaseline = process.argv.includes("--update-baseline");
  const serverSurfacesClean = checkServerSurfaces();
  const emDashClean = checkEmDash();
  const keyParityClean = checkKeyParity();
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
    if (!serverSurfacesClean || !emDashClean || !keyParityClean) process.exit(1);
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
    if (!serverSurfacesClean || !emDashClean || !keyParityClean) process.exit(1);
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
