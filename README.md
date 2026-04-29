# @deno/astro-adapter

This adapter allows Astro to run your SSR site in Deno. Astro 6 works in Deno
runtime (without Node).

Learn how to deploy your Astro site in our
[Deno Deploy guide](https://docs.astro.build/en/guides/deploy/deno/).

## Overview

- [Why Astro Deno](#why-astro-deno)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Examples](#examples)
- [Contributing](#contributing)

## Why Astro Deno

[Deno](https://deno.com/) is a runtime similar to Node, but with an API that's
more similar to the browser's API. This adapter provides access to Deno's API
and creates a script to run your project on a Deno server.

- **Are you using Astro as a static site builder?**\
  No, you don't need an adapter

- **Are you using Astro server-side rendering (SSR)?**\
  Yes, you need an adapter

- **Do you wish to deploy your site to
  [Deno Deploy](https://deno.com/deploy)?**\
  Yes, you also need an adapter

## Installation

Add the Deno adapter to enable SSR in your Astro project with the following
steps:

#### 1. Add an adapter

```sh
deno add npm:@deno/astro-adapter
```

#### 2. Update your astro.config.mjs file

```js ins={3,6-7}
// astro.config.mjs
import { defineConfig } from "astro/config";
import deno from "@deno/astro-adapter";

export default defineConfig({
  output: "server",
  adapter: deno(),
});
```

#### 3. Next, update your deno.json (or package.json)

```jsonc
// deno.json
{
  "tasks": {
    "dev": "deno run -A npm:astro dev",
    "build": "deno run -A npm:astro build",
    "preview": "deno run --allow-net --allow-read --allow-env ./dist/server/entry.mjs",
  },
}

// package.json
{
  "scripts": {
    "dev": "deno run -A npm:astro dev",
    "build": "deno run -A npm:astro build",
    "preview": "deno run --allow-net --allow-read --allow-env ./dist/server/entry.mjs",
  },
}
```

#### 4. You can now preview your production Astro site locally with Deno

```sh
deno task build 
deno task preview
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

## Examples

The [Deno + Astro Template](https://github.com/denoland/deno-astro-template)
includes a `preview` command that runs the entry script directly. Run
`npm run build` then `npm run preview` to run the production deno server.

## Contributing

To configure your development environment, clone the repository and install
dependencies.

```sh
git clone
cd astro-adapter
deno i
```

The Deno Astro Adapter is currently built and tested with Deno 2.x. To test your
changes make sure you have Deno 2.x installed

```sh
deno task test
```

Finally, you can check your code formatting with

```sh
deno fmt
```

This package is maintained by Deno's Core team. You're welcome to submit an
issue or PR!
