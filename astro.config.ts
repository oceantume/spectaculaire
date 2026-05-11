import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://spectaculaire.fly.dev",
  output: "static",
  redirects: {
    "/": "/feq-2026/",
  },
});
