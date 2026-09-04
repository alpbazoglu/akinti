/**
 * AKINTI live migration runner.
 *
 * Applies every `supabase/migrations/*.sql` file (excluding the `down/`
 * subfolder, which holds per-migration rollbacks — see `--down` below) to a
 * real Postgres database, in filename order, inside one transaction per
 * file. Already-applied files are tracked in `public.schema_migrations` and
 * skipped on re-run, so this script is safe to run repeatedly (e.g. after
 * adding new migrations) without re-running everything.
 *
 * This is a thin, dependency-light alternative to `supabase db push` for
 * environments where the Supabase CLI's Docker-based diffing isn't wanted,
 * or where a plain `psql`/pg connection is preferred. `supabase db push`
 * (see supabase/README.md) remains the primary documented path; this script
 * is the fallback/CI-friendly path.
 *
 * Run with:
 *   npx tsx scripts/apply-migrations.ts                 (apply pending migrations)
 *   npx tsx scripts/apply-migrations.ts --dry-run        (list what would run; no DB connection)
 *   npx tsx scripts/apply-migrations.ts --seed           (also run supabase/seed.sql after
 *                                                          migrations, only when NODE_ENV !== "production")
 *   npx tsx scripts/apply-migrations.ts --down <name>    (run the matching down/ file for
 *                                                          <name> and delete its tracking row)
 *
 * Env (see .env.example / supabase/README.md): DATABASE_URL or
 * SUPABASE_DB_URL — a full Postgres connection string. Get it from the
 * Supabase dashboard: Project Settings -> Database -> Connection string
 * (URI). The session pooler variant
 * (`postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`)
 * is recommended on IPv4-only networks; the direct variant
 * (`postgres://postgres:<password>@db.<ref>.supabase.co:5432/postgres`)
 * works anywhere IPv6 (or Supabase's IPv4 add-on) is available. Either form
 * is accepted as-is — this script does not parse or rewrite it.
 *
 * TLS: connects with `ssl: { rejectUnauthorized: false }`. Supabase's
 * Postgres (direct and pooler) always terminates TLS with a certificate
 * that is not in Node's default trust store by default, and Supabase does
 * not currently publish a stable CA bundle path for either connection mode
 * that's convenient to pin here — full chain verification is therefore
 * turned off while the channel is still encrypted in transit. This is the
 * same tradeoff Supabase's own docs and most community tooling (e.g.
 * Prisma's Supabase guide) make for this exact use case. Do not point this
 * script at a non-Supabase database without reconsidering that tradeoff.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";

/* ------------------------------------------------------------------------ */
/* Minimal .env loader (same approach as scripts/worker.ts)                 */
/* ------------------------------------------------------------------------ */

/**
 * `next dev`/`next build` load `.env.local` automatically; a standalone
 * script run through `tsx` does not. Rather than add a `dotenv` dependency
 * for four lines of parsing, read it directly. Existing `process.env`
 * values (e.g. from a real deployment environment) always win.
 */
function loadEnvFile(): void {
  for (const name of [".env.local", ".env"]) {
    const filePath = path.resolve(process.cwd(), name);
    if (!existsSync(filePath)) {
      continue;
    }
    const contents = readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq === -1) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}

/* ------------------------------------------------------------------------ */
/* Migration discovery                                                      */
/* ------------------------------------------------------------------------ */

const MIGRATIONS_DIR = path.resolve(process.cwd(), "supabase", "migrations");
const DOWN_DIR = path.join(MIGRATIONS_DIR, "down");
const SEED_FILE = path.resolve(process.cwd(), "supabase", "seed.sql");
const TRACKING_TABLE_SQL = `
create table if not exists public.schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
);
`;

interface MigrationFile {
  /** Filename without the .sql extension, used as the tracking-table key. */
  name: string;
  fullPath: string;
}

/** Every `supabase/migrations/*.sql` file, in filename order. Excludes `down/`. */
function listMigrations(): MigrationFile[] {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => ({
      name: entry.replace(/\.sql$/, ""),
      fullPath: path.join(MIGRATIONS_DIR, entry),
    }));
}

function findDownFile(name: string): string {
  const candidate = path.join(DOWN_DIR, `${name}_down.sql`);
  if (existsSync(candidate)) {
    return candidate;
  }
  // Also accept the bare migration filename (with or without .sql) as given.
  const stripped = name.replace(/\.sql$/, "").replace(/_down$/, "");
  const alt = path.join(DOWN_DIR, `${stripped}_down.sql`);
  if (existsSync(alt)) {
    return alt;
  }
  throw new Error(
    `No down/ file found for "${name}". Expected one of:\n  ${candidate}\n  ${alt}`,
  );
}

/* ------------------------------------------------------------------------ */
/* Postgres error formatting                                                */
/* ------------------------------------------------------------------------ */

interface PgErrorLike {
  message?: string;
  position?: string;
  code?: string;
}

/** `<message> (position <n>)` when Postgres reports a character offset, else just the message. */
function formatPgError(err: unknown): string {
  const pgErr = err as PgErrorLike;
  const message = pgErr?.message ?? String(err);
  const parts = [message];
  if (pgErr?.code) {
    parts.push(`[${pgErr.code}]`);
  }
  if (pgErr?.position) {
    parts.push(`at position ${pgErr.position}`);
  }
  return parts.join(" ");
}

/* ------------------------------------------------------------------------ */
/* Connection                                                               */
/* ------------------------------------------------------------------------ */

function getConnectionString(): string {
  const url = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL (or SUPABASE_DB_URL) is not set. Get it from the Supabase " +
        "dashboard: Project Settings -> Database -> Connection string (URI). " +
        "See supabase/README.md.",
    );
  }
  return url;
}

function createClient(): Client {
  return new Client({
    connectionString: getConnectionString(),
    // Supabase's direct and pooler endpoints terminate TLS with a certificate
    // outside Node's default trust store; see the header comment above.
    ssl: { rejectUnauthorized: false },
  });
}

/* ------------------------------------------------------------------------ */
/* Core actions                                                             */
/* ------------------------------------------------------------------------ */

async function ensureTrackingTable(client: Client): Promise<void> {
  await client.query(TRACKING_TABLE_SQL);
}

async function getAppliedNames(client: Client): Promise<Set<string>> {
  const result = await client.query<{ name: string }>(
    "select name from public.schema_migrations",
  );
  return new Set(result.rows.map((row) => row.name));
}

async function applyMigration(client: Client, migration: MigrationFile): Promise<void> {
  const sql = readFileSync(migration.fullPath, "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query(
      "insert into public.schema_migrations (name) values ($1) on conflict (name) do nothing",
      [migration.name],
    );
    await client.query("commit");
    console.log(`applied  ${migration.name}`);
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw new Error(`FAILED ${migration.name}: ${formatPgError(err)}`);
  }
}

async function runSeed(client: Client): Promise<void> {
  if (!existsSync(SEED_FILE)) {
    throw new Error(`Seed file not found: ${SEED_FILE}`);
  }
  const sql = readFileSync(SEED_FILE, "utf8");
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("commit");
    console.log("applied  seed.sql");
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw new Error(`FAILED seed.sql: ${formatPgError(err)}`);
  }
}

async function runDown(client: Client, name: string): Promise<void> {
  const downPath = findDownFile(name);
  const trackedName = name.replace(/\.sql$/, "").replace(/_down$/, "");
  const sql = readFileSync(downPath, "utf8");
  console.log(`Running down migration: ${path.basename(downPath)}`);
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("delete from public.schema_migrations where name = $1", [trackedName]);
    await client.query("commit");
    console.log(`applied  ${path.basename(downPath)} (tracking row for "${trackedName}" removed)`);
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw new Error(`FAILED ${path.basename(downPath)}: ${formatPgError(err)}`);
  }
}

/* ------------------------------------------------------------------------ */
/* CLI                                                                       */
/* ------------------------------------------------------------------------ */

function parseArgs(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const seed = argv.includes("--seed");
  const downIdx = argv.indexOf("--down");
  const down = downIdx !== -1 ? argv[downIdx + 1] : undefined;
  if (downIdx !== -1 && !down) {
    throw new Error("--down requires a migration name argument, e.g. --down 20260903120100_extensions_enums_helpers");
  }
  return { dryRun, seed, down };
}

async function main(): Promise<void> {
  loadEnvFile();
  const { dryRun, seed, down } = parseArgs(process.argv.slice(2));

  const migrations = listMigrations();

  if (dryRun) {
    // Dry-run must not require a DB connection (or even DATABASE_URL to be
    // set) so it can be used as an offline sanity check.
    console.log(`Would apply ${migrations.length} migration(s), in order:`);
    for (const m of migrations) {
      console.log(`  ${m.name}`);
    }
    if (seed) {
      console.log(`Would then run seed.sql (skipped if NODE_ENV === "production")`);
    }
    if (down) {
      console.log(`--down ${down} requested, but --dry-run takes precedence; nothing executed.`);
    }
    return;
  }

  const client = createClient();
  await client.connect();
  try {
    await ensureTrackingTable(client);

    if (down) {
      await runDown(client, down);
      return;
    }

    const applied = await getAppliedNames(client);
    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        console.log(`skipped  ${migration.name}`);
        continue;
      }
      await applyMigration(client, migration);
    }

    if (seed) {
      if (process.env.NODE_ENV === "production") {
        console.log("skipped  seed.sql (NODE_ENV=production; dev-only seed data refused)");
      } else {
        await runSeed(client);
      }
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
