import { build } from "vite";

await build({
  configFile: false,
  build: {
    outDir: "out/desktop",
    emptyOutDir: false,
    target: "es2022",
    lib: {
      entry: "src/host/engine.ts",
      name: "HuazheshuEngine",
      formats: ["iife"],
      fileName: () => "engine.js",
    },
  },
});
