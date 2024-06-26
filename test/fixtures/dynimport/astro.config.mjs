import { defineConfig } from "astro/config";
import deno from "@deno/astro-adapter";

export default defineConfig({
  adapter: deno(),
  output: "server",
});
