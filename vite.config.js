import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss()],
  base: mode === "pages" ? "/beam/" : "/",
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Next.js client directives have no effect in this client-only Vite app.
        if (
          warning.code === "MODULE_LEVEL_DIRECTIVE" &&
          warning.message.includes("use client")
        )
          return;
        warn(warning);
      },
    },
  },
  define: { __PAGES__: JSON.stringify(mode === "pages") },
}));
