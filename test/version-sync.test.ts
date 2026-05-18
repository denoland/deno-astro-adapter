import { assert } from "@std/assert";
import {
  JSR_STD_HTTP_FILE_SERVER,
  JSR_STD_PATH,
} from "../src/vite-plugin-config.ts";

Deno.test("JSR specifiers in virtual.d.ts are in sync with the source-of-truth consts", async () => {
  const dts = await Deno.readTextFile(
    new URL("../virtual.d.ts", import.meta.url),
  );

  assert(
    dts.includes(JSR_STD_HTTP_FILE_SERVER),
    `virtual.d.ts is out of sync — expected substring ${JSR_STD_HTTP_FILE_SERVER}. ` +
      `Update virtual.d.ts to match JSR_STD_HTTP_FILE_SERVER in src/vite-plugin-config.ts.`,
  );

  assert(
    dts.includes(JSR_STD_PATH),
    `virtual.d.ts is out of sync — expected substring ${JSR_STD_PATH}. ` +
      `Update virtual.d.ts to match JSR_STD_PATH in src/vite-plugin-config.ts.`,
  );
});
