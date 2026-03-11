# Plan: Spectaculaire

## Context

See `docs/PROJECT.md` for the product goals. This document covers architecture and setup decisions.

## Architecture

A single-page app with no server. Data is read from a local JSON file bundled at build time. No router, no state lib, no date library.

## Tech Stack

- **Vite** — build tool; JSON imports are bundled natively
- **Preact** — lightweight React-compatible UI (`.tsx` files)
- **`@preact/preset-vite`** — Vite plugin for Preact JSX/TSX transform
- **TypeScript 7 beta (`tsgo`)** — via `@typescript/native-preview`; replaces `tsc` for type-checking
- **Tailwind CSS v4** — via `@tailwindcss/vite` plugin (no config file needed)
- **BiomeJS** — linter and formatter (replaces ESLint + Prettier)
- **Husky** — git hooks (pre-commit runs `tsgo` + `biome`)

## Tooling

### Type-checking (`tsgo`)

TypeScript 7 beta ships as a native binary via the `@typescript/native-preview` package. It exposes a `tsgo` binary that is a drop-in for `tsc`.

```
npm install --save-dev @typescript/native-preview
```

Run: `npx tsgo --noEmit`

### Linting & formatting (BiomeJS)

```
npm install --save-dev @biomejs/biome
```

Config: `biome.json` at project root.

Run: `npx biome check --write .`

### Pre-commit hook (Husky)

```
npm install --save-dev husky
npx husky init
```

`.husky/pre-commit` runs both checks so commits are always clean.

### `npm run check`

Both tools are also wired to an npm script so they can be run manually:

```json
"scripts": {
  "check": "tsgo --noEmit && biome check ."
}
```

## Project Structure

```
src/
  main.tsx              # render(<App />, document.getElementById('app'))
  App.tsx               # root component — Hello, World for now
  index.css             # @import 'tailwindcss'
index.html              # minimal shell, <div id="app">, imports src/main.tsx
vite.config.ts
tsconfig.json
biome.json
package.json
.husky/
  pre-commit            # npx tsgo --noEmit && npx biome check .
```

## First Version

The first working version renders a "Hello, World" heading in `App.tsx` and nothing else. Its purpose is to validate that the full toolchain works end-to-end:

1. `npm install` — no errors
2. `npm run dev` — Vite serves the app; "Hello, World" renders in the browser
3. `npm run check` — `tsgo` and `biome` both pass with no errors
4. Make a commit — Husky pre-commit hook runs and passes

Features (schedule table, filters, artist modal) are out of scope for this version.
