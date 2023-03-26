import { build } from "esbuild";

await build({
  entryPoints: ["src/index.tsx"],
  bundle: true,
  outdir: "dist",
  format: "esm",
  packages: "external",
  target: "es2016",
  minify: true,
  mangleProps: /_$/,
  sourcemap: "external",
});
