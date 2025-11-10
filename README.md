# @deno/astro-adapter

This adapter allows Astro to deploy your SSR site to Deno targets.

Learn how to deploy your Astro site in our
[Deno Deploy deployment guide](https://docs.astro.build/en/guides/deploy/deno/).

- <strong> [Why Astro Deno](#why-astro-deno)</strong>
- <strong> [Installation](#installation)</strong>
- <strong> [Usage](#usage)</strong>
- <strong> [Configuration](#configuration)</strong>
- <strong> [Examples](#examples)</strong>
- <strong> [Contributing](#contributing)</strong>

## Why Astro Deno

If you're using Astro as a static site builder—its behavior out of the box—you
don't need an adapter.

If you wish to
[use server-side rendering (SSR)](https://docs.astro.build/en/guides/server-side-rendering/),
Astro requires an adapter that matches your deployment runtime.

You also need an adapter or server if you wish to deploy your site to
[Deno Deploy](https://deno.com/deploy).

[Deno](https://deno.com/) is a runtime similar to Node, but with an API that's
more similar to the browser's API. This adapter provides access to Deno's API
and creates a script to run your project on a Deno server.

## Installation

Add the Deno adapter to enable SSR in your Astro project with the following
steps:

1. Install the Deno adapter to your project’s dependencies using your preferred
   package manager. If you’re using npm or aren’t sure, run this in the
   terminal:

   ```bash
   npm install @deno/astro-adapter
   ```

1. Update your `astro.config.mjs` project configuration file with the changes
   below.

   ```js ins={3,6-7}
   // astro.config.mjs
   import { defineConfig } from "astro/config";
   import deno from "@deno/astro-adapter";

   export default defineConfig({
     output: "server",
     adapter: deno(),
   });
   ```

Next, update your `preview` script in `package.json` to run `deno`:

```json ins={8}
// package.json
{
  // ...
  "scripts": {
    "dev": "astro dev",
    "start": "astro dev",
    "build": "astro build",
    "preview": "deno run --allow-net --allow-read --allow-env ./dist/server/entry.mjs"
  }
}
```

You can now use this command to preview your production Astro site locally with
Deno.

```bash
npm run preview
```

## Usage

After
[performing a build](https://docs.astro.build/en/guides/deploy/#building-your-site-locally)
there will be a `dist/server/entry.mjs` module. You can start a server by
importing this module in your Deno app:

```js
import "./dist/server/entry.mjs";
```

See the `start` option below for how you can have more control over starting the
Astro server.

You can also run the script directly using deno:

```sh
deno run --allow-net --allow-read --allow-env ./dist/server/entry.mjs
```

## Configuration

To configure this adapter, pass an object to the `deno()` function call in
`astro.config.mjs`.

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import deno from "@deno/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: deno({
    //options go here
  }),
});
```

### start

This adapter automatically starts a server when it is imported. You can turn
this off with the `start` option:

```js
import { defineConfig } from "astro/config";
import deno from "@deno/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: deno({
    start: false,
  }),
});
```

If you disable this, you need to write your own Deno web server. Import and call
`handle` from the generated entry script to render requests:

```ts
import { handle } from "./dist/server/entry.mjs";

Deno.serve((req: Request) => {
  // Check the request, maybe do static file handling here.

  return handle(req);
});
```

### port and hostname

You can set the port (default: `8085`) and hostname (default: `0.0.0.0`) for the
deno server to use. If `start` is false, this has no effect; your own server
must configure the port and hostname.

```js
import { defineConfig } from "astro/config";
import deno from "@deno/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: deno({
    port: 8081,
    hostname: "myhost",
  }),
});
```

### deno deploy

In order to use this adapter with deno deploy you need to add npm prefix so that
the packages name will be bundled with npm prefix

```js
import "npm:xxx";
// import 'xxx'
```

To enable this feature Set prefixNpmForDenoDeploy to `true` like so

```js
import { defineConfig } from "astro/config";
import deno from "@deno/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: deno({
    prefixNpmForDenoDeploy: true;
  }),
});
```

_**Good to know**_ to get more consistent builds use `deno task build` in ci
pipeline

## Examples

The [Deno + Astro Template](https://github.com/denoland/deno-astro-template)
includes a `preview` command that runs the entry script directly. Run
`npm run build` then `npm run preview` to run the production deno server.

## Contributing

To configure your development environment, clone the repository and install
[`pnpm`](https://pnpm.io/). `pnpm` is a package manager that emphasizes disk
space efficiency and is used for managing the dependencies of this project. Once
installed, run `pnpm i` to install the dependencies.

```sh
git clone
cd astro-adapter
pnpm i
```

The Deno Astro Adapter is currently built and tested with Deno 2.x. To test your
changes make sure you have Deno 2.x installed

```sh
pnpm run test
```

Finally, you can check your code formatting with: `pnpm run fmt`.

This package is maintained by Deno's Core team. You're welcome to submit an
issue or PR!
