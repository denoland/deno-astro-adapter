/// <reference types="astro/client" />

declare module "virtual:@deno/astro-adapter:config" {
  const config: import("./src/types.ts").InternalOptions;
  export = config;
}

declare module "virtual:@deno/astro-adapter:static-server" {
  export function loadStaticServer(): Promise<{
    serveFile: typeof import("jsr:@std/http@^1.1.0/file-server").serveFile;
    fromFileUrl: typeof import("jsr:@std/path@^1.1.4").fromFileUrl;
  }>;
}
