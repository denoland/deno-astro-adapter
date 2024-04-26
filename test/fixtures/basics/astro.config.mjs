import { defineConfig } from 'astro/config';
import deno from '@deno/astro-adapter';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';

export default defineConfig({
	adapter: deno(),
	integrations: [react(), mdx()],
	output: 'server'
})
