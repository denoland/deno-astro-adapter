import type { AstroAdapter, AstroConfig, AstroIntegration } from "astro";
import * as fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { BuildConfig, Options } from "./types";
import { join, relative } from "node:path";
import { npmPrefixPlugin } from "./rollupPluginNpmPrefix";

const STD_VERSION = `1.0`;
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

// We shim deno-specific imports so we can run the code in Node
// to prerender pages. In the final Deno build, this import is
// replaced with the Deno-specific contents listed below.
const DENO_SHIM_PATH = `@deno/astro-adapter/__deno_imports.ts`;
const DENO_IMPORTS =
  `import { serveFile } from "jsr:@std/http@${STD_VERSION}/file-server";
import { fromFileUrl } from "jsr:@std/path@${STD_VERSION}";`;
const DENO_SHIM_BASE = `import { serveFile, fromFileUrl } from`;
const DENO_IMPORTS_SHIM = `${DENO_SHIM_BASE} "${DENO_SHIM_PATH}";`;
const DENO_IMPORTS_SHIM_LEGACY = `${DENO_SHIM_BASE} '${DENO_SHIM_PATH}';`;

export function getAdapter(
  args: Options | undefined,
  config: AstroConfig,
): AstroAdapter {
  const clientPath = join(fileURLToPath(config.build.client));
  const serverPath = join(
    fileURLToPath(config.build.server),
    config.build.serverEntry,
  );
  const relativeClientPath = relative(serverPath, clientPath) + "/";
  const realArgs = { ...args, relativeClientPath };
  return {
    name: "@deno/astro-adapter",
    serverEntrypoint: "@deno/astro-adapter/server.ts",
    args: realArgs,
    exports: ["stop", "handle", "start", "running"],
    supportedAstroFeatures: {
      hybridOutput: "stable",
      staticOutput: "stable",
      serverOutput: "stable",
      sharpImageService: "stable",
    },
    adapterFeatures: {
      envGetSecret: "stable",
    },
  };
}

export default function createIntegration(args?: Options): AstroIntegration {
  let _buildConfig: BuildConfig;
  return {
    name: "@deno/astro-adapter",
    hooks: {
      "astro:config:done": ({ setAdapter, config }) => {
        setAdapter(getAdapter(args, config));
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
            vite.build.rollupOptions.external.push(DENO_SHIM_PATH);
          } else if (typeof vite.build.rollupOptions.external !== "function") {
            vite.build.rollupOptions.external = [
              vite.build.rollupOptions.external,
              DENO_SHIM_PATH,
            ];
          }
          if (args?.prefixNpmForDenoDeploy) {
            if (Array.isArray(vite.build.rollupOptions.plugins)) {
              vite.build.rollupOptions.plugins.push(npmPrefixPlugin());
            } else if (typeof vite.build.rollupOptions.plugins !== "function") {
              vite.build.rollupOptions.plugins = [
                vite.build.rollupOptions.plugins,
                npmPrefixPlugin(),
              ];
            }
          }
        }
      },
      "astro:build:done": async () => {
        // Replace `import { serveFile, fromFileUrl } from '@deno/astro-adapter/__deno_imports.ts';` in one of the chunks/ files with the actual imports.
        const chunksDirUrl = new URL("./chunks/", _buildConfig.server);
        for (const file of fs.readdirSync(chunksDirUrl)) {
          if (!file.endsWith(".mjs")) continue;
          const pth = fileURLToPath(new URL(file, chunksDirUrl));
          const contents = fs.readFileSync(pth, "utf-8");
          if (
            !contents.includes(DENO_IMPORTS_SHIM_LEGACY) &&
            !contents.includes(DENO_IMPORTS_SHIM)
          ) continue;
          fs.writeFileSync(
            pth,
            contents.replace(
              DENO_IMPORTS_SHIM_LEGACY,
              DENO_IMPORTS,
            ).replace(
              DENO_IMPORTS_SHIM,
              DENO_IMPORTS,
            ),
          );
        }
      },
    },
  };
}
