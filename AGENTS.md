# AGENTS.md

High-signal guidance for OpenCode agents working in this repository.

## Critical Commands

```bash
# Development - must use this, not 'vite' directly
npm run dev

# Build order matters: typecheck (tsc) → vite build
npm run build

# Platform-specific installers (outputs to release/)
npm run build:win:all    # Windows: .exe + .zip
npm run build:linux      # Linux: AppImage + deb + rpm + tar.gz

# Lint only - no test/typecheck in one command
npm run lint
```

## Architecture Boundaries

**Three-Layer Electron Architecture:**

1. **Main Process** (`electron/main.ts`): Node.js environment, all system operations
2. **Preload Script** (`electron/preload.ts`): Secure bridge, exposes `window.api` to renderer
3. **Renderer Process** (`src/`): Vue 3 frontend, no direct Node.js access

**IPC Flow (enforced):** Vue component → `window.api.*` → preload → `ipcMain.handle()` → main process

Never import Node.js modules directly in `src/` files.

## Build System Quirks

- **Vite + Electron Plugin**: Uses `vite-plugin-electron` for main/preload bundling
- **Externals**: `electron`, `ssh2`, `electron-store` must be external (see `vite.config.ts`)
- **ASAR disabled**: `asar: false` in package.json for native module compatibility
- **Native modules**: `ssh2` and its deps (`cpu-features`, `nan`, etc.) explicitly included in build files

## AI Agent System (LangChain/LangGraph)

**Entry**: `electron/ai/index.ts` registers IPC handlers

**Key constraint**: LangChain/LangGraph requires `crypto` globally. `main.ts` polyfills:
```typescript
import { webcrypto } from 'node:crypto'
if (!globalThis.crypto) globalThis.crypto = webcrypto as Crypto
```

**Agent flow**: `command-agent.ts` (ReAct) → `command-tools.ts` → LLM with function calling

## Protocol Command Differences

Connection protocol affects CLI flag format (see `src/stores/connection.ts`):

| Protocol | Flag Format |
|----------|-------------|
| tcp/udp | `-e protocol://host:port` |
| http | `--endpoints=protocol://host:port` |

## Data Persistence

Uses `electron-store` (not localStorage). Stores:
- Connection configs per SSH host (`sshConnectionMap`)
- AI provider settings
- UI preferences (theme, font size)

Access via IPC: `window.api.db.get()`, `window.api.db.set()`

## Release Process

GitHub Actions triggers on `v*.*.*` tags (`.github/workflows/release.yml`):
1. Version auto-updated from tag in CI
2. Builds Windows + Linux in parallel
3. Uploads to GitHub Releases automatically

## Common Pitfalls

- **ssh2 native deps**: Don't add to bundle, keep as external
- **Path alias**: `@/` maps to `src/` only (not `electron/`)
- **TypeScript**: `noEmit: true` - Vite handles compilation
- **Electron version**: Locked to 28.3.3 (check before upgrading)

## File Output Locations

| Build Stage | Path |
|-------------|------|
| Vite frontend | `dist/` |
| Electron main/preload | `dist-electron/` |
| Installers/packages | `release/` |

## Reference

See `CLAUDE.md` for detailed component inventory and implementation patterns.
