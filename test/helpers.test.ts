import { assertEquals } from "jsr:@std/assert@1.0";
import { mergeObjects } from "../src/helpers.ts";

Deno.test({
  name: "merge objects",
  async fn() {
    const src: any = {
      a: 1,
      b: [1, 2, 3],
      c: {
        d: 1,
      },
    };

    const other: any = {
      b: [4, 5, 6],
      c: {
        e: 2,
      },
    };

    assertEquals(mergeObjects(src, other), {
      a: 1,
      b: [1, 2, 3, 4, 5, 6],
      c: {
        d: 1,
        e: 2,
      },
    });
  },
});
