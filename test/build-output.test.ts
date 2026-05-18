import { assert } from "@std/assert";
import { defaultTestPermissions, runBuild } from "./helpers.ts";

const dir = new URL("./", import.meta.url);

async function readServerBundle(fixturePath: string): Promise<string> {
  const serverDir = new URL(`${fixturePath}dist/server/`, dir);
  const parts: string[] = [];
  for await (const ent of Deno.readDir(serverDir)) {
    if (ent.isFile && ent.name.endsWith(".mjs")) {
      parts.push(await Deno.readTextFile(new URL(ent.name, serverDir)));
    }
    if (ent.isDirectory && ent.name === "chunks") {
      const chunksDir = new URL("chunks/", serverDir);
      for await (const c of Deno.readDir(chunksDir)) {
        if (c.isFile && c.name.endsWith(".mjs")) {
          parts.push(await Deno.readTextFile(new URL(c.name, chunksDir)));
        }
      }
    }
  }
  return parts.join("\n");
}

Deno.test({
  name: "build output: start option gates JSR specifiers in bundle",
  permissions: defaultTestPermissions,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    await t.step("default (start:true) — JSR specifiers present", async () => {
      await runBuild("./fixtures/basics/");
      const bundle = await readServerBundle("./fixtures/basics/");
      assert(
        bundle.includes("jsr:@std/http@^1.1.0/file-server"),
        "expected jsr:@std/http file-server specifier in bundle",
      );
      assert(
        bundle.includes("jsr:@std/path@^1.1.4"),
        "expected jsr:@std/path specifier in bundle",
      );
    });

    await t.step("start:false — JSR specifiers absent", async () => {
      await runBuild("./fixtures/start-false/");
      const bundle = await readServerBundle("./fixtures/start-false/");
      assert(
        !bundle.includes("jsr:@std/http"),
        "expected no jsr:@std/http reference in start:false bundle",
      );
      assert(
        !bundle.includes("jsr:@std/path"),
        "expected no jsr:@std/path reference in start:false bundle",
      );
      // sanity: stub did get emitted (proves the virtual is wired up,
      // we're not just hitting an empty file)
      assert(
        bundle.includes("unavailable when start:false"),
        "expected start:false stub message in bundle",
      );
    });
  },
});
