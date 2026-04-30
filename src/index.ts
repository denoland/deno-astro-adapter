import type { AstroIntegration } from "astro";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildConfig, InternalOptions, Options } from "./types.ts";
import { createConfigPlugin } from "./vite-plugin-config.ts";

// REF: https://github.com/denoland/deno/tree/main/ext/node/polyfills
const COMPATIBLE_NODE_MODULES = [
  "assert",
  "assert/strict",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "sys",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "wasi",
  // 'webcrypto',
  "worker_threads",
  "zlib",
];

export const JSR_STD_HTTP_FILE_SERVER = "jsr:@std/http@^1.1.0/file-server";
export const JSR_STD_PATH = "jsr:@std/path@^1.1.4";

export default function createIntegration(args?: Options): AstroIntegration {
  let _buildConfig: BuildConfig;
  const internalOptions: InternalOptions = { ...args, relativeClientPath: "" };
  return {
    name: "@deno/astro-adapter",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          vite: {
            plugins: [createConfigPlugin(internalOptions)],
          },
        });
      },
      "astro:config:done": ({ setAdapter, config }) => {
        const clientPath = join(fileURLToPath(config.build.client));
        const serverPath = join(
          fileURLToPath(config.build.server),
          config.build.serverEntry,
        );
        internalOptions.relativeClientPath = relative(serverPath, clientPath) +
          "/";
        setAdapter({
          name: "@deno/astro-adapter",
          entrypointResolution: "auto",
          serverEntrypoint: "@deno/astro-adapter/server.ts",
          supportedAstroFeatures: {
            hybridOutput: "stable",
            staticOutput: "stable",
            serverOutput: "stable",
            sharpImageService: "stable",
          },
        });
        _buildConfig = config.build;
      },
      "astro:build:setup": ({ vite, target }) => {
        if (target === "server") {
          vite.resolve = vite.resolve ?? {};
          vite.resolve.alias = vite.resolve.alias ?? {};
          vite.build = vite.build ?? {};
          vite.build.rollupOptions = vite.build.rollupOptions ?? {};
          vite.build.rollupOptions.external =
            vite.build.rollupOptions.external ?? [];

          const aliases = [
            {
              find: "react-dom/server",
              replacement: "react-dom/server.browser",
            },
            ...COMPATIBLE_NODE_MODULES.map((mod) => ({
              find: `${mod}`,
              replacement: `node:${mod}`,
            })),
          ];

          if (Array.isArray(vite.resolve.alias)) {
            vite.resolve.alias = [...vite.resolve.alias, ...aliases];
          } else {
            for (const alias of aliases) {
              (vite.resolve.alias as Record<string, string>)[alias.find] =
                alias.replacement;
            }
          }

          if (Array.isArray(vite.build.rollupOptions.external)) {
            vite.build.rollupOptions.external.push(
              JSR_STD_HTTP_FILE_SERVER,
              JSR_STD_PATH,
            );
          } else if (typeof vite.build.rollupOptions.external !== "function") {
            vite.build.rollupOptions.external = [
              vite.build.rollupOptions.external,
              JSR_STD_HTTP_FILE_SERVER,
              JSR_STD_PATH,
            ];
          }
        }
      },
    },
  };
}
