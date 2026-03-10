/// <reference types="astro/client" />

declare module "virtual:@deno/astro-adapter:config" {
  const config: import("./src/types.js").InternalOptions;
  export = config;
}
