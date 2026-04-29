import { fromFileUrl } from "@std/path";
import { assert } from "@std/assert";

interface AstroServerModule {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  running?: () => boolean;
}

const dir = new URL("./", import.meta.url);
const defaultURL = new URL("http://localhost:8085/");

export const defaultTestPermissions: Deno.PermissionOptions = {
  read: true,
  net: true,
  run: true,
  env: true,
};

export async function runBuild(fixturePath: string) {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-env",
      "--allow-read",
      "--allow-write",
      "--allow-run",
      "--allow-net",
      "--allow-ffi",
      "--allow-sys",
      "npm:astro",
      "build",
      "--silent",
    ],
    cwd: fromFileUrl(new URL(fixturePath, dir)),
  });
  const process = command.spawn();
  try {
    const status = await process.status;
    assert(status.success);
  } finally {
    safeKill(process);
  }
}

export async function startModFromImport(
  baseUrl: URL,
): Promise<AstroServerModule> {
  const entryUrl = new URL("./dist/server/entry.mjs", baseUrl);
  const mod = await import(entryUrl.toString());
  return mod;
}

export async function startModFromSubprocess(
  baseUrl: URL,
): Promise<AstroServerModule> {
  const entryUrl = new URL("./dist/server/entry.mjs", baseUrl);
  const command = new Deno.Command("deno", {
    args: ["run", "--allow-env", "--allow-net", fromFileUrl(entryUrl)],
    cwd: fromFileUrl(baseUrl),
    stderr: "piped",
  });
  const process = command.spawn();
  await waitForServer(process);

  // here we simulate Astro entry module public interface
  return {
    start: async () => {}, // stub, assuming server running after waitForServer
    stop: async () => {
      safeKill(process);
      await process.status;
    },
  };
}

async function waitForServer(process: Deno.ChildProcess) {
  const reader = process.stderr.getReader();
  const dec = new TextDecoder();

  while (true) {
    const { value } = await reader.read();
    if (!value) {
      throw new Error("Server did not start");
    }
    const msg = dec.decode(value);
    if (msg.includes("Server running")) {
      break;
    }
  }
  reader.cancel();
}

function safeKill(process: Deno.ChildProcess) {
  try {
    process.kill("SIGKILL");
  } catch {
    // ignore
  }
}

export async function runBuildAndStartApp(fixturePath: string) {
  const url = new URL(fixturePath, dir);

  await runBuild(fixturePath);
  const app = await startModFromImport(url);

  return { url: defaultURL, ...app };
}

export async function runBuildAndStartAppFromSubprocess(fixturePath: string) {
  const url = new URL(fixturePath, dir);

  await runBuild(fixturePath);
  const app = await startModFromSubprocess(url);

  return { url: defaultURL, ...app };
}
