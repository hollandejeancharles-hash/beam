import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? "/beam/" : "/",
  define: { __PAGES__: JSON.stringify(mode === "pages") },
}));
