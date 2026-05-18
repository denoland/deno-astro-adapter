import { assert } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { runBuild } from "./helpers.ts";

const dir = new URL("./", import.meta.url);
const defaultURL = new URL("http://0.0.0.0:8085/");

// Regression test for #58: variable-specifier `await import(VAR)` hides the
// JSR module from Deno's static graph, so it's not pre-cached, and the
// isolate crashes under --cached-only with:
//
//   TypeError: JSR package manifest for '@std/http' failed to load.
//   Specifier not found in cache: ...
//
// This test reproduces the failure mode locally: it builds the basics
// fixture, populates a fresh DENO_DIR via `deno cache` (static graph only),
// then runs the built entry with --cached-only and hits a route that
// forces loadStaticServer() to execute.
Deno.test({
  name:
    "--cached-only: built entry serves static-file fallback w/ only the static graph cached",
  permissions: {
    read: true,
    net: true,
    run: true,
    env: true,
    write: true,
  },
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    const fixture = "./fixtures/basics/";
    const baseUrl = new URL(fixture, dir);
    const entryPath = fromFileUrl(new URL("./dist/server/entry.mjs", baseUrl));

    await runBuild(fixture);

    const denoDir = await Deno.makeTempDir({
      prefix: "deno-astro-adapter-cached-only-",
    });
    let serverProcess: Deno.ChildProcess | undefined;
    try {
      await t.step("deno cache pre-populates the static graph", async () => {
        const cmd = new Deno.Command(Deno.execPath(), {
          args: ["cache", entryPath],
          cwd: fromFileUrl(baseUrl),
          env: { DENO_DIR: denoDir },
          stderr: "piped",
        });
        const { success, stderr } = await cmd.output();
        assert(
          success,
          `deno cache failed:\n${new TextDecoder().decode(stderr)}`,
        );
      });

      await t.step("server boots under --cached-only", async () => {
        const cmd = new Deno.Command(Deno.execPath(), {
          args: [
            "run",
            "--cached-only",
            "--allow-env",
            "--allow-net",
            "--allow-read",
            entryPath,
          ],
          cwd: fromFileUrl(baseUrl),
          env: { DENO_DIR: denoDir },
          stderr: "piped",
        });
        serverProcess = cmd.spawn();
        await waitForServerOrThrow(serverProcess);
      });

      await t.step(
        "static-file fallback path runs without crashing the isolate",
        async () => {
          // Path doesn't match any astro route → handler falls through to
          // loadStaticServer() → serveFile → 404 → handler renders custom
          // 404 page. The key signal is that loadStaticServer() didn't
          // crash the isolate. We don't care about exact status, just that
          // a real response came back (i.e., process is still alive and
          // handled the request).
          const resp = await fetch(new URL("/no-such-route", defaultURL));
          await resp.text();
          assert(
            resp.status < 500,
            `expected non-5xx, got ${resp.status} — loadStaticServer likely threw`,
          );
        },
      );
    } finally {
      if (serverProcess) {
        try {
          serverProcess.kill("SIGKILL");
        } catch { /* already dead */ }
        await serverProcess.status;
      }
      await Deno.remove(denoDir, { recursive: true });
    }
  },
});

async function waitForServerOrThrow(process: Deno.ChildProcess) {
  const reader = process.stderr.getReader();
  const dec = new TextDecoder();
  let accumulated = "";
  const deadline = Date.now() + 30_000;
  try {
    while (Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) {
        throw new Error(
          `Server exited before "Server running" message. stderr:\n${accumulated}`,
        );
      }
      if (value) accumulated += dec.decode(value);
      if (accumulated.includes("Server running")) return;
    }
    throw new Error(
      `Server did not start in time. stderr:\n${accumulated}`,
    );
  } finally {
    reader.cancel();
  }
}
