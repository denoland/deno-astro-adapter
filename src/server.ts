// Normal Imports
import type { SSRManifest } from "astro";
import { App } from "astro/app";
import type { Options } from "./types";

// @ts-expect-error
import { fromFileUrl, serveFile } from "@deno/astro-adapter/__deno_imports.ts";

let _server: Server | undefined = undefined;
let _startPromise: Promise<void> | undefined = undefined;

async function* getPrerenderedFiles(clientRoot: URL): AsyncGenerator<URL> {
  // @ts-expect-error
  for await (const ent of Deno.readDir(clientRoot)) {
    if (ent.isDirectory) {
      yield* getPrerenderedFiles(new URL(`./${ent.name}/`, clientRoot));
    } else if (ent.name.endsWith(".html")) {
      yield new URL(`./${ent.name}`, clientRoot);
    }
  }
}

function removeTrailingForwardSlash(path: string) {
  return path.endsWith("/") ? path.slice(0, path.length - 1) : path;
}

export function start(manifest: SSRManifest, options: Options) {
  if (options.start === false) {
    return;
  }

  const clientRoot = new URL("../client/", import.meta.url);
  const app = new App(manifest);
  const handler = async (request: Request, handlerInfo: any) => {
    if (app.match(request)) {
      const hostname = handlerInfo.remoteAddr?.hostname;
      Reflect.set(request, Symbol.for("astro.clientAddress"), hostname);
      const response = await app.render(request);
      if (app.setCookieHeaders) {
        for (const setCookieHeader of app.setCookieHeaders(response)) {
          response.headers.append("Set-Cookie", setCookieHeader);
        }
      }
      return response;
    }

    // If the request path wasn't found in astro,
    // try to fetch a static file instead
    const url = new URL(request.url);
    const localPath = new URL("./" + app.removeBase(url.pathname), clientRoot);

    let fileResp = await serveFile(request, fromFileUrl(localPath));

    // Attempt to serve `index.html` if 404
    if (fileResp.status == 404) {
      let fallback;
      for await (const file of getPrerenderedFiles(clientRoot)) {
        const pathname = file.pathname.replace(/\/(index)?\.html$/, "");
        if (removeTrailingForwardSlash(localPath.pathname).endsWith(pathname)) {
          fallback = file;
          break;
        }
      }
      if (fallback) {
        fileResp = await serveFile(request, fromFileUrl(fallback));
      }
    }

    // If the static file can't be found
    if (fileResp.status == 404) {
      // Render the astro custom 404 page
      const response = await app.render(request);

      if (app.setCookieHeaders) {
        for (const setCookieHeader of app.setCookieHeaders(response)) {
          response.headers.append("Set-Cookie", setCookieHeader);
        }
      }
      return response;

      // If the static file is found
    } else {
      return fileResp;
    }
  };

  const port = options.port ?? 8085;
  const hostname = options.hostname ?? "0.0.0.0";
  _server = Deno.serve({ port, hostname }, handler);
  _startPromise = _server.finished;
  console.error(`Server running on port ${port}`);
}

export function createExports(manifest: SSRManifest, options: Options) {
  const app = new App(manifest);
  return {
    async stop() {
      if (_server) {
        _server.shutdown();
        _server = undefined;
      }
      await Promise.resolve(_startPromise);
    },
    running() {
      return _server !== undefined;
    },
    async start() {
      return start(manifest, options);
    },
    async handle(request: Request) {
      return app.render(request);
    },
  };
}
