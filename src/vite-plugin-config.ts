import type { AstroConfig } from "astro";
import type { InternalOptions } from "./types.ts";

type VitePlugin = NonNullable<AstroConfig["vite"]["plugins"]>[number];

const VIRTUAL_CONFIG_ID = "virtual:@deno/astro-adapter:config";
const RESOLVED_VIRTUAL_CONFIG_ID = "\0" + VIRTUAL_CONFIG_ID;

export function createConfigPlugin(config: InternalOptions): VitePlugin {
  return {
    name: VIRTUAL_CONFIG_ID,
    resolveId: {
      filter: {
        id: new RegExp(`^${VIRTUAL_CONFIG_ID}$`),
      },
      handler() {
        return RESOLVED_VIRTUAL_CONFIG_ID;
      },
    },
    load: {
      filter: {
        id: new RegExp(`^${RESOLVED_VIRTUAL_CONFIG_ID}$`),
      },
      handler() {
        return Object.entries(config)
          .map(([k, v]) => `export const ${k} = ${JSON.stringify(v)};`)
          .join("\n");
      },
    },
  };
}

const VIRTUAL_STATIC_SERVER_ID = "virtual:@deno/astro-adapter:static-server";
const RESOLVED_VIRTUAL_STATIC_SERVER_ID = "\0" + VIRTUAL_STATIC_SERVER_ID;

export const JSR_STD_HTTP_FILE_SERVER = "jsr:@std/http@^1.1.0/file-server";
export const JSR_STD_PATH = "jsr:@std/path@^1.1.4";

// Literal-string `await import("jsr:...")` keeps the specifiers in the static
// module graph (so Deno Deploy's analyzer can pre-cache them under
// --cached-only) while deferring execution until the loader is awaited.
const STATIC_SERVER_ENABLED_SRC = /* js */`let _cached;
export async function loadStaticServer() {
  if (!_cached) {
    const [http, path] = await Promise.all([
      import("${JSR_STD_HTTP_FILE_SERVER}"),
      import("${JSR_STD_PATH}"),
    ]);
    _cached = { serveFile: http.serveFile, fromFileUrl: path.fromFileUrl };
  }
  return _cached;
}
`;

const STATIC_SERVER_DISABLED_SRC = /* js */`export async function loadStaticServer() {
  throw new Error(
    "@deno/astro-adapter: static-file serving is unavailable when start:false. " +
    "Handle static files in your own server before calling handle().",
  );
}
`;

export function createStaticServerPlugin(config: InternalOptions): VitePlugin {
  return {
    name: VIRTUAL_STATIC_SERVER_ID,
    resolveId: {
      filter: {
        id: new RegExp(`^${VIRTUAL_STATIC_SERVER_ID}$`),
      },
      handler() {
        return RESOLVED_VIRTUAL_STATIC_SERVER_ID;
      },
    },
    load: {
      filter: {
        id: new RegExp(`^${RESOLVED_VIRTUAL_STATIC_SERVER_ID}$`),
      },
      handler() {
        return config.start === false
          ? STATIC_SERVER_DISABLED_SRC
          : STATIC_SERVER_ENABLED_SRC;
      },
    },
  };
}
