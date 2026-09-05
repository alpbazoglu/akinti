#!/usr/bin/env node
/**
 * Launches the Python sidecar (sidecar/) via `npm run sidecar`.
 *
 * Prefers `sidecar/.venv` (created per sidecar/README.md: `python -m venv
 * sidecar/.venv && pip install -r sidecar/requirements.txt`) if it exists,
 * so a developer who followed the README gets the right interpreter
 * automatically; falls back to `py -3` (Windows launcher) or `python3` on
 * PATH otherwise. Never silently falls back to a `python` that might be
 * Python 2 or a wrong environment without the sidecar's dependencies --
 * uvicorn's own import error is the honest failure mode if that happens.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const sidecarDir = path.resolve(import.meta.dirname, "..", "sidecar");
const isWindows = process.platform === "win32";

const venvPython = path.join(sidecarDir, ".venv", isWindows ? "Scripts" : "bin", isWindows ? "python.exe" : "python");

function pickInterpreter() {
  if (existsSync(venvPython)) {
    return venvPython;
  }
  return isWindows ? "py" : "python3";
}

const interpreter = pickInterpreter();
const interpreterArgs = interpreter === "py" ? ["-3"] : [];
const host = process.env.SIDECAR_HOST ?? "127.0.0.1";
const port = process.env.SIDECAR_PORT ?? "8011";

console.log(`[sidecar] starting with ${interpreter} on ${host}:${port} (cwd: ${sidecarDir})`);

const child = spawn(
  interpreter,
  [...interpreterArgs, "-m", "uvicorn", "app.main:app", "--host", host, "--port", port],
  { cwd: sidecarDir, stdio: "inherit" },
);

child.on("exit", (code) => process.exit(code ?? 0));
