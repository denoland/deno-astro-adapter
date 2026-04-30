import { createApp } from "astro/app/entrypoint";
import { setGetEnv } from "astro/env/setup";
setGetEnv((key) => Deno.env.get(key));
import * as options from "virtual:@deno/astro-adapter:config";
import { JSR_STD_HTTP_FILE_SERVER, JSR_STD_PATH } from "./index.ts";

const app = createApp();

let _server: Deno.HttpServer | undefined = undefined;
let _startPromise: Promise<void> | undefined = undefined;

async function* getPrerenderedFiles(clientRoot: URL): AsyncGenerator<URL> {
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

async function start() {
  const { serveFile } = await import(JSR_STD_HTTP_FILE_SERVER);
  const { fromFileUrl } = await import(JSR_STD_PATH);

  // undefined = not yet loaded, null = not installed
  let trace: import("@opentelemetry/api").TraceAPI | null | undefined;

  const clientRoot = new URL(options.relativeClientPath, import.meta.url);
  const handler: Deno.ServeHandler = async (request, handlerInfo) => {
    if (trace === undefined) {
      try {
        trace = (await import("@opentelemetry/api")).trace;
      } catch {
        trace = null;
        // @open-telemetry/api is not installed
      }
    }
    const routeData = app.match(request);
    if (routeData) {
      const span = trace?.getActiveSpan();
      span?.updateName(`${request.method} ${routeData.route}`);
      span?.setAttribute("http.route", routeData.route);
      span?.setAttribute("astro.prerendered", routeData.prerender);
      span?.setAttribute("astro.type", routeData.type);
      const hostname = handlerInfo.remoteAddr?.hostname;
      Reflect.set(request, Symbol.for("astro.clientAddress"), hostname);
      const response = await app.render(request, { routeData });
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
    if (fileResp.status === 404) {
      let fallback: URL | undefined;
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
    if (fileResp.status === 404) {
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

if (options.start ?? true) {
  start();
}

export async function stop() {
  if (_server) {
    _server.shutdown();
    _server = undefined;
  }
  await Promise.resolve(_startPromise);
}

export function running() {
  return _server !== undefined;
}

export { start };

export function handle(request: Request) {
  return app.render(request);
}
