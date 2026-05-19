# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**kvctlTool** is an Electron desktop application that provides a GUI for `craftctl`/`etcdctl` KV command-line tools. It supports both local execution and SSH remote execution modes.

**Tech Stack**: Electron 28 + Vue 3.4 + TypeScript + Vite + Element Plus + Pinia + ssh2

## Common Commands

```bash
# Development - starts Vite dev server with Electron
npm run dev

# Build for production (outputs to dist/ and dist-electron/)
npm run build

# Build platform-specific installers (outputs to release/)
npm run build:win:all    # Windows (.exe + .zip)
npm run build:linux      # Linux (AppImage + deb + rpm + tar.gz)

# Lint TypeScript
npm run lint
```

## Architecture

### Electron Main Process (`electron/main.ts`)

Handles all Node.js operations:
- **Window Management**: Creates BrowserWindow with preload script
- **IPC Handlers**: All `ipcMain.handle()` calls for renderer-to-main communication
- **Local Command Execution**: Uses `child_process.spawn` to run craftctl commands
- **SSH Operations**: Uses `ssh2` library for connections and remote execution
- **Data Persistence**: Uses `electron-store` for settings and SSH configs

Key IPC channels exposed via `window.api`:
- `craftctl:execute` - Execute local craftctl commands
- `ssh:connect/testConnect/execute/disconnect` - SSH operations
- `db:*` - Persistent storage operations
- `dialog:openFile/openFileRemote` - File dialogs (local and SFTP)

### Preload Script (`electron/preload.ts`)

Exposes a secure API bridge (`window.api`) to the renderer process. All main process communication goes through this layer.

### Vue Frontend (`src/`)

**Entry**: `main.ts` → `App.vue`

**Components**:
- `AppHeader.vue` - Mode toggle (local/SSH), theme switch, settings
- `ConnectionPanel.vue` - Protocol/host/port configuration
- `KVOperationPanel.vue` - Get/put/delete operations
- `AdvancedOptions.vue` - Prefix query, keys-only toggles
- `SSHManager.vue` - SSH config management and connection
- `OutputTerminal.vue` - Command output display
- `CommandBar.vue` - Custom command input
- `SettingsDialog.vue` - Tool path, font size, appearance settings
- `RemoteFileBrowserDialog.vue` - SFTP file browser for SSH mode

**State Management** (Pinia stores):
- `connection.ts` - Connection config (protocol, host, port, mode, toolPath)
- `ssh.ts` - SSH configurations and connection status
- `settings.ts` - Theme, font sizes, query options
- `output.ts` - Command outputs and toast notifications

## Key Implementation Details

### Dual Mode Execution

The app supports two execution modes:

1. **Local Mode**: Directly spawns `craftctl` using child_process
2. **SSH Mode**: Connects via ssh2, then executes commands on the remote host

Mode switching preserves connection settings per SSH config via `sshConnectionMap` in electron-store.

### Protocol Handling

- **tcp/udp**: Command uses `-e protocol://host:port` format
- **http**: Command uses `--endpoints=protocol://host:port` format

See `connection.ts` - `endpointFlag` computed property.

### Command Execution Flow

```
User clicks button → Vue component → Pinia action → window.api.* →
ipcRenderer.invoke → main.ts handler → spawn/ssh.exec →
IPC callback → Vue component update
```

### Theme System

CSS variables defined in `style.css` (`:root`). Theme switching updates CSS custom properties and applies Element Plus theme classes (`dark` class for dark mode).

## Release Process

GitHub Actions workflow (`.github/workflows/release.yml`) triggers on version tags (`v*.*.*`). Builds for Windows and Linux, uploads to GitHub Releases automatically.

## File Locations

| Output | Path |
|--------|------|
| Vite build | `dist/` |
| Electron build | `dist-electron/` |
| Installers/packages | `release/` |

## TypeScript Configuration

Path alias `@/` maps to `src/` directory. Included paths: `src/**/*.ts`, `src/**/*.tsx`, `src/**/*.vue`, `electron/**/*.ts`.
