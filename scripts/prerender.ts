import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { build } from "vite";

// Shims for synchronous render-time browser API calls:
// - useStoredState calls localStorage.getItem() during useState initialization
// - App.tsx calls window.matchMedia() directly to determine default theme
(globalThis as unknown as Record<string, unknown>).localStorage = {
	getItem: () => null,
	setItem: () => {},
};
(globalThis as unknown as Record<string, unknown>).window = {
	matchMedia: () => ({ matches: false }),
};

await build({
	configFile: false,
	plugins: [preact(), tailwindcss()],
	build: {
		ssr: "src/entry-server.tsx",
		outDir: "dist/server",
		rollupOptions: {
			output: { inlineDynamicImports: true },
		},
	},
	logLevel: "warn",
});

const entryUrl = new URL("../dist/server/entry-server.js", import.meta.url).href;
const { render } = (await import(entryUrl)) as { render: () => string };

const template = readFileSync("dist/index.html", "utf-8");
const result = template.replace(
	'<div id="app"></div>',
	`<div id="app">${render()}</div>`,
);
writeFileSync("dist/index.html", result);

rmSync("dist/server", { recursive: true });

console.log("Pre-rendered dist/index.html");
