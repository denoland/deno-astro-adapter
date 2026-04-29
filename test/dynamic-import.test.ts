import { DOMParser } from "@b-fuze/deno-dom";
import { assert, assertEquals } from "@std/assert";
import { runBuildAndStartAppFromSubprocess } from "./helpers.ts";

Deno.test({
  name: "Dynamic import",
  async fn(t) {
    const app = await runBuildAndStartAppFromSubprocess(
      "./fixtures/dynimport/",
    );

    await t.step("Works", async () => {
      const resp = await fetch(app.url);
      assertEquals(resp.status, 200);
      const html = await resp.text();
      assert(html);
      const doc = new DOMParser().parseFromString(html, `text/html`);
      const div = doc!.querySelector("#thing");
      assert(div, "div exists");
    });

    await app.stop();
  },
});
