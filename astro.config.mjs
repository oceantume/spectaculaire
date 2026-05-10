import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";

export default defineConfig({
  output: "static",
  redirects: {
    "/": "/feq-2026/",
  },
  vite: {
    plugins: [tailwindcss()],
  },
});
