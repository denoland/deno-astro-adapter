import type esbuild from "esbuild";

export interface Options {
  port?: number;
  hostname?: string;
  start?: boolean;
  esbuild?: Partial<esbuild.BuildOptions>;
}

export interface BuildConfig {
  server: URL;
  serverEntry: string;
  assets: string;
}
