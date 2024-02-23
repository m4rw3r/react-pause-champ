import dts from "rollup-plugin-dts";

export default [
  {
    input: "./src/index.ts",
    output: { file: "dist/index.d.ts", format: "es", sourcemap: true },
    plugins: [dts()],
  },
  {
    input: "./src/internal/index.ts",
    output: { file: "dist/internal/index.d.ts", format: "es", sourcemap: true },
    plugins: [dts()],
  },
];
