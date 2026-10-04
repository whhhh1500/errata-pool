import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  base: "/errata-pool/",
  build: { outDir: path.resolve(__dirname, "../docs"), emptyOutDir: true, target: "es2022" },
  server: { fs: { allow: [path.resolve(__dirname, "..")] } },
});
