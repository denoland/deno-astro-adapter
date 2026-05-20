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

// Exported to use in config so vite treats these modules as external
export const JSR_STD_HTTP_FILE_SERVER = "jsr:@std/http@^1.1.0/file-server";
export const JSR_STD_PATH = "jsr:@std/path@^1.1.4";
