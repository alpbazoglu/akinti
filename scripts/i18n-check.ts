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
 * Zero-tolerance (no ratchet, no baseline): the last 7 files/17 instances of
 * client-side hardcoded copy (`ModerationPage`, `SearchPage`,
 * `SuspendedPage`, `ErrorPage`/`NotFoundPage`, `OnboardingFlow.tsx`) were
 * migrated to `src/messages/{tr,en}.json` in review3 finding 3's pass, and
 * `scripts/i18n-check.baseline.json` was emptied and deleted — every hit
 * from here on is a real regression, the same standard §1's server-side
 * scan already holds. A bare domain/path literal (e.g. `OnboardingFlow.tsx`'s
 * `akinti.app/u/{username}` handle preview) is not copy to translate — see
 * `isUrlLike` below.
 *
 * Run with `npm run lint` (wired in `package.json`) or directly:
 *   npx tsx scripts/i18n-check.ts
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import ts from "typescript";

const ROOT = path.resolve(__dirname, "..");
const SCAN_DIRS = ["src/app", "src/components"];

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

/**
 * A bare domain/path literal (e.g. `OnboardingFlow.tsx`'s
 * `akinti.app/u/{username}` handle preview) is not user-facing copy to
 * translate — it's the product's own domain, shown as-is in every locale.
 * Matches an optional `scheme://` followed by a dotted host and path,
 * deliberately narrow (starts with a host-shaped token, no spaces) so real
 * sentences that merely mention a URL are still flagged.
 */
const URL_LIKE_PATTERN = /^(?:[a-z][a-z0-9+.-]*:\/\/)?[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[^\s]*)?$/i;
function isUrlLike(value: string): boolean {
  return URL_LIKE_PATTERN.test(value);
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
    if (!trimmed || !hasLetters(trimmed) || isUrlLike(trimmed)) return;
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

/** Returns `true` if the server-side surfaces are clean. */
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

/** Zero-tolerance `.tsx` scan — see this file's header comment for why the old baseline ratchet is gone. Returns `true` if clean. */
function checkTsxSurfaces(): boolean {
  const files = SCAN_DIRS.flatMap(listTsxFiles);
  const violationsByFile = new Map<string, Violation[]>();
  let totalInstances = 0;

  for (const file of files) {
    const violations = countViolations(file);
    if (violations.length > 0) {
      const rel = path.relative(ROOT, file).replace(/\\/g, "/");
      violationsByFile.set(rel, violations);
      totalInstances += violations.length;
    }
  }

  if (violationsByFile.size === 0) {
    console.log(`i18n-check: .tsx surfaces clean — 0 hardcoded copy across ${files.length} file(s) (src/app/**, src/components/**).`);
    return true;
  }

  console.error(`\ni18n-check: hardcoded copy in ${violationsByFile.size} file(s), ${totalInstances} instance(s):`);
  for (const [file, violations] of violationsByFile) {
    for (const violation of violations) {
      console.error(`  ${file}:${violation.line} — "${violation.snippet}"`);
    }
  }
  console.error("\nMove the string into src/messages/{tr,en}.json and reference it via useTranslations/getTranslations.");
  return false;
}

function main() {
  const serverSurfacesClean = checkServerSurfaces();
  const emDashClean = checkEmDash();
  const keyParityClean = checkKeyParity();
  const tsxSurfacesClean = checkTsxSurfaces();

  if (!serverSurfacesClean || !emDashClean || !keyParityClean || !tsxSurfacesClean) {
    process.exit(1);
  }
}

main();
