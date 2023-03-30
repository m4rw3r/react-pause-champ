import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2021",
    lib: {
      entry: "src",
      fileName: "index",
      formats: ["es", "cjs"],
    },
    minify: false,
    rollupOptions: {
      external: ["react"],
      output: {
        globals: {
          react: "React",
        },
      },
    },
    sourcemap: true,
  },
});
