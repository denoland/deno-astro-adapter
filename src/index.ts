import type { AstroAdapter, AstroIntegration } from "astro";
import esbuild from "esbuild";
import * as fs from "node:fs";
import * as npath from "node:path";
import { fileURLToPath } from "node:url";
import type { BuildConfig, Options } from "./types";
import { mergeObjects } from "./helpers";

const SHIM = `globalThis.process ??= {
	argv: [],
	env: Deno.env.toObject(),
};`;

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
const DENO_IMPORTS_SHIM = `@deno/astro-adapter/__deno_imports.ts`;
const DENO_IMPORTS =
  `import { serveFile } from "jsr:@std/http@${STD_VERSION}/file-server";
import { fromFileUrl } from "jsr:@std/path@${STD_VERSION}";`;
const DENO_EXPORTS =
  `export { serveFile } from "jsr:@std/http@${STD_VERSION}/file-server";
export { fromFileUrl } from "jsr:@std/path@${STD_VERSION}";`;

export function getAdapter(args?: Options): AstroAdapter {
  return {
    name: "@deno/astro-adapter",
    serverEntrypoint: "@deno/astro-adapter/server.ts",
    args: args ?? {},
    exports: ["stop", "handle", "start", "running"],
    supportedAstroFeatures: {
      hybridOutput: "stable",
      staticOutput: "stable",
      serverOutput: "stable",
    },
  };
}

const denoImportsShimPlugin = {
  name: "@deno/astro-adapter:shim",
  setup(build: esbuild.PluginBuild) {
    build.onLoad({ filter: /__deno_imports\.ts$/ }, async () => {
      return {
        contents: DENO_EXPORTS,
        loader: "ts",
      };
    });
    build.onResolve({ filter: /^jsr:@std/ }, (args) => {
      return { path: args.path, external: true };
    });
  },
};

export default function createIntegration(args?: Options): AstroIntegration {
  let _buildConfig: BuildConfig;
  let _vite: any;
  return {
    name: "@deno/astro-adapter",
    hooks: {
      "astro:config:done": ({ setAdapter, config }) => {
        setAdapter(getAdapter(args));
        _buildConfig = config.build;
      },
      "astro:build:setup": ({ vite, target }) => {
        if (target === "server") {
          _vite = vite;
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
            vite.build.rollupOptions.external.push(DENO_IMPORTS_SHIM);
          } else if (typeof vite.build.rollupOptions.external !== "function") {
            vite.build.rollupOptions.external = [
              vite.build.rollupOptions.external,
              DENO_IMPORTS_SHIM,
            ];
          }
        }
      },
      "astro:build:done": async () => {
        if (process.env.ASTRO_DENO_UNBUNDLED) {
          // Replace `import { serveFile, fromFileUrl } from '@deno/astro-adapter/__deno_imports.ts';` in one of the chunks/ files with the actual imports.
          const chunksDirUrl = new URL("./chunks/", _buildConfig.server);
          for (const file of fs.readdirSync(chunksDirUrl)) {
            if (!file.endsWith(".mjs")) continue;
            const pth = fileURLToPath(new URL(file, chunksDirUrl));
            const contents = fs.readFileSync(pth, "utf-8");
            fs.writeFileSync(
              pth,
              contents.replace(
                `import { serveFile, fromFileUrl } from '${DENO_IMPORTS_SHIM}';`,
                DENO_IMPORTS,
              ),
            );
          }
        } else {
          const entryUrl = new URL(
            _buildConfig.serverEntry,
            _buildConfig.server,
          );
          const pth = fileURLToPath(entryUrl);

          const esbuildConfig = mergeObjects<esbuild.BuildOptions>(
            {
              target: "esnext",
              platform: "browser",
              entryPoints: [pth],
              outfile: pth,
              allowOverwrite: true,
              format: "esm",
              bundle: true,
              external: [
                ...COMPATIBLE_NODE_MODULES.map((mod) => `node:${mod}`),
                "@astrojs/markdown-remark",
              ],
              plugins: [denoImportsShimPlugin],
              banner: {
                js: SHIM,
              },
              logOverride: {
                "ignored-bare-import": "silent",
              },
            },
            args?.esbuild || {},
          );
          await esbuild.build(esbuildConfig);
        }
      },
    },
  };
}
