// Audits the npm dependencies resolved in `deno.lock` against the Socket
// database (https://socket.dev). Socket has no native `deno.lock` parser, so
// this extracts the fully-resolved npm graph from the lockfile's top-level
// `npm` key and scores each package with the Socket CLI.
//
// On a pull request it scores only the packages that are newly added or bumped
// relative to the base branch (the common case reviewers care about). Pass
// `--all` to score the entire resolved npm graph instead.
//
//   deno run -A scripts/socket-audit.ts          # diff vs. BASE_SHA
//   deno run -A scripts/socket-audit.ts --all    # whole graph
//
// Environment:
//   BASE_SHA                  git sha of the PR base; enables diff mode
//   SOCKET_SECURITY_API_KEY   Socket API token; when unset the audit is skipped
//   GITHUB_STEP_SUMMARY       when set, the markdown report is appended here

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

if (!Deno.env.get("SOCKET_SECURITY_API_KEY")) {
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

const report: string[] = [
  "## Socket dependency audit",
  "",
  `Scored ${targets.length} new/changed npm package(s) from \`deno.lock\`:`,
  "",
];
let failures = 0;

for (const pkg of targets) {
  const { code, stdout, stderr } = await new Deno.Command("deno", {
    args: [
      "run",
      "-A",
      "npm:@socketsecurity/cli",
      "package",
      "score",
      "npm",
      pkg,
      "--markdown",
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();

  const out = new TextDecoder().decode(stdout).trim();
  const err = new TextDecoder().decode(stderr).trim();

  if (code !== 0) {
    failures++;
    console.error(`FAILED to score ${pkg}:\n${err || out}\n`);
    report.push(
      `### \`${pkg}\``,
      "",
      "⚠️ Socket lookup failed:",
      "",
      "```",
      err || out,
      "```",
      "",
    );
    continue;
  }

  console.log(out + "\n");
  report.push(`### \`${pkg}\``, "", out, "");
}

const summaryPath = Deno.env.get("GITHUB_STEP_SUMMARY");
if (summaryPath) {
  await Deno.writeTextFile(summaryPath, report.join("\n") + "\n", {
    append: true,
  });
}

if (failures > 0) {
  console.error(`\n${failures} package(s) could not be scored against Socket.`);
  Deno.exit(1);
}
