// Audits the npm dependencies resolved in `deno.lock` against the Socket
// database (https://socket.dev). Socket has no native `deno.lock` parser, so
// this extracts the fully-resolved npm graph from the lockfile's top-level
// `npm` key and scores the packages via Socket's batch PURL API in a single
// request (one CLI call per package rate-limits hard on large diffs).
//
// On a pull request it scores only the packages that are newly added or bumped
// relative to the base branch (the common case reviewers care about). Pass
// `--all` to score the entire resolved npm graph instead.
//
//   deno run -A scripts/socket-audit.ts          # diff vs. BASE_SHA
//   deno run -A scripts/socket-audit.ts --all    # whole graph
//
// This reports Socket alerts for the audited packages but does not fail the
// job on them (informational). Flip GATE below to make risky alerts blocking.
// If the API is out of quota / rate-limited, the audit soft-skips (exit 0)
// rather than red-failing the PR on an infrastructure condition.
//
// Environment:
//   BASE_SHA                  git sha of the PR base; enables diff mode
//   SOCKET_SECURITY_API_KEY   Socket API token; when unset the audit is skipped
//   GITHUB_STEP_SUMMARY       when set, the markdown report is appended here

const API = "https://api.socket.dev/v0/purl?alerts=true";
const BATCH = 1000; // API allows up to 1024 PURLs per request.
const GATE = false; // when true, exit non-zero if any blocking alert is found.

/** Extract a normalized `name@version` set from a deno.lock's `npm` section. */
function parseNpmKeys(lockText: string): Set<string> {
  const lock = JSON.parse(lockText);
  const set = new Set<string>();
  for (const key of Object.keys(lock.npm ?? {})) {
    // Scoped names start with `@`, so the name/version separator is the next
    // `@`. Deno appends peer-dep disambiguators (e.g. `_astro@6.1.10`) that are
    // not part of the npm version, so strip everything after the first `_`.
    const sep = key.startsWith("@") ? key.indexOf("@", 1) : key.indexOf("@");
    if (sep <= 0) continue;
    const name = key.slice(0, sep);
    const version = key.slice(sep + 1).split("_")[0];
    set.add(`${name}@${version}`);
  }
  return set;
}

/** Return `git show <ref>:<path>`, or null when the ref/path is unavailable. */
async function gitShow(ref: string, path: string): Promise<string | null> {
  const { code, stdout } = await new Deno.Command("git", {
    args: ["show", `${ref}:${path}`],
    stdout: "piped",
    stderr: "null",
  }).output();
  return code === 0 ? new TextDecoder().decode(stdout) : null;
}

/** A non-2xx Socket API response, carrying the HTTP status for the caller. */
class SocketApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** POST a batch of PURLs to Socket, retrying on 429/5xx with backoff. */
async function batchScore(
  apiKey: string,
  purls: string[],
): Promise<Record<string, unknown>[]> {
  const body = JSON.stringify({ components: purls.map((purl) => ({ purl })) });
  for (let attempt = 0;; attempt++) {
    const res = await fetch(API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body,
    });
    if (res.ok) {
      const text = await res.text();
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      try {
        // Expected shape: NDJSON, one package object per line.
        return lines.map((l) => JSON.parse(l) as Record<string, unknown>);
      } catch {
        // Fallback: a single JSON array/object body.
        const parsed = JSON.parse(text);
        return (Array.isArray(parsed) ? parsed : [parsed]) as Record<
          string,
          unknown
        >[];
      }
    }
    const detail = await res.text();
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      const wait = 2 ** attempt * 1000;
      console.error(`Socket API ${res.status}; retrying in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    throw new SocketApiError(
      res.status,
      `Socket API ${res.status} ${res.statusText}: ${detail}`,
    );
  }
}

/** Append a message to the GitHub Actions job summary, if running in CI. */
async function writeSummary(text: string): Promise<void> {
  const path = Deno.env.get("GITHUB_STEP_SUMMARY");
  if (path) await Deno.writeTextFile(path, text + "\n", { append: true });
}

const apiKey = Deno.env.get("SOCKET_SECURITY_API_KEY");
if (!apiKey) {
  console.log(
    "SOCKET_SECURITY_API_KEY is not set — skipping the Socket audit. " +
      "Add the repository secret to enable it.",
  );
  Deno.exit(0);
}

const auditAll = Deno.args.includes("--all");
const head = parseNpmKeys(await Deno.readTextFile("deno.lock"));
const baseSha = Deno.env.get("BASE_SHA");

let targets: string[];
if (auditAll || !baseSha) {
  targets = [...head].sort();
} else {
  const baseText = await gitShow(baseSha, "deno.lock");
  const base = baseText ? parseNpmKeys(baseText) : new Set<string>();
  targets = [...head].filter((pkg) => !base.has(pkg)).sort();
}

if (targets.length === 0) {
  console.log("No new npm dependencies in deno.lock to audit against Socket.");
  Deno.exit(0);
}

console.log(`Auditing ${targets.length} npm package(s) against Socket...\n`);

// `name@version` -> `pkg:npm/name@version` (scope `@` is left unencoded, which
// is what Socket accepts, e.g. `pkg:npm/@astrojs/mdx@5.0.6`).
const purls = targets.map((pkg) => `pkg:npm/${pkg}`);

const results: Record<string, unknown>[] = [];
try {
  for (let i = 0; i < purls.length; i += BATCH) {
    results.push(...await batchScore(apiKey, purls.slice(i, i + BATCH)));
  }
} catch (err) {
  // Quota exhaustion / persistent rate limiting is an infrastructure condition,
  // not a security finding — warn and soft-skip instead of red-failing the PR.
  if (err instanceof SocketApiError && err.status === 429) {
    const msg =
      `⚠️ Socket audit skipped — API quota or rate limit reached.\n\n${err.message}`;
    console.warn(msg);
    await writeSummary(`## Socket dependency audit\n\n${msg}`);
    Deno.exit(0);
  }
  throw err;
}

interface Alert {
  type?: string;
  severity?: string;
  action?: string;
  category?: string;
}
const isBlocking = (a: Alert) =>
  a.action === "error" ||
  ["critical", "high"].includes(String(a.severity).toLowerCase());

const flagged: string[] = [];
let alertCount = 0;
for (const pkg of results) {
  const purl = String(pkg.purl ?? `${pkg.name}@${pkg.version}`);
  const alerts = (Array.isArray(pkg.alerts) ? pkg.alerts : []) as Alert[];
  alertCount += alerts.length;
  const blocking = alerts.filter(isBlocking);
  if (blocking.length === 0) continue;
  flagged.push(`### \`${purl}\``);
  for (const a of blocking) {
    flagged.push(
      `- **${a.severity ?? a.action}** — ${a.type}${
        a.category ? ` (${a.category})` : ""
      }`,
    );
  }
  flagged.push("");
}

const report = [
  "## Socket dependency audit",
  "",
  `Scored **${results.length}** new/changed npm package(s) from \`deno.lock\`` +
  ` — ${alertCount} alert(s) total, ${
    flagged.length ? "see below" : "none blocking"
  }.`,
  "",
];
if (flagged.length) report.push("### Blocking alerts", "", ...flagged);

console.log(report.join("\n"));
await writeSummary(report.join("\n"));

if (GATE && flagged.length) {
  console.error(
    `\nBlocking Socket alerts found on ${flagged.length} entr(ies).`,
  );
  Deno.exit(1);
}
