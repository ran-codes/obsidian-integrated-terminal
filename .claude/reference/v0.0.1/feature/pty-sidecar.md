# Feature: PTY Sidecar Process

## The Problem

Obsidian plugins run inside Electron's **renderer process**. Native Node.js addons like `node-pty` (which provides real terminal PTY support) cannot load in this context because:

1. **node-pty is not context-aware** -- open issue since 2020 (microsoft/node-pty#405), still unfixed
2. **Electron ABI mismatch** -- node-pty ships prebuilt binaries for Node.js, not Electron. The binary must be recompiled for the exact Electron version Obsidian uses, which changes with updates
3. **No rebuild tooling** -- Obsidian doesn't expose `electron-rebuild`, so plugin authors can't recompile native modules in-place

Without a real PTY, the terminal falls back to `child_process.spawn()` with pipes. This means:

- `isatty()` returns `false` -- interactive programs refuse to start or render broken
- No tab completion, no shell history navigation, no cursor movement
- No colors from programs that check for TTY before emitting ANSI codes
- **Claude CLI, vim, htop, and all interactive TUI programs do not work**

This is the same limitation the original obsidian-terminal plugin (polyipseity) had in its integrated-only mode. It only worked when paired with an external terminal window.

## Solutions Evaluated

### 1. Direct node-pty require (Failed)

```
Plugin (Electron renderer) --require()--> node-pty (native .node binary)
```

Result: `node-pty` loads but is not context-aware. Electron warns or refuses. Even if it loads, the prebuilt binary is compiled for Node.js ABI, not Electron's ABI, causing `NODE_MODULE_VERSION` mismatch crashes.

### 2. Rebuild node-pty for Electron (`@electron/rebuild`)

```bash
npx @electron/rebuild -v 32.2.5 -w node-pty -a x64
```

Would produce a `conpty.node` binary compatible with Obsidian's Electron. But:

- Must ship prebuilt binaries for every Electron version (ABI 128, 130, 132, 134+)
- Breaks every time Obsidian updates Electron
- Requires Visual Studio Build Tools + Python to compile
- Still has the context-aware problem in the renderer

Verdict: **Fragile, high maintenance.**

### 3. conhost.exe with hidden window (polyipseity approach)

```
Plugin --spawn()--> conhost.exe --wraps--> powershell.exe
                    (windowsHide: true)
```

The original obsidian-terminal plugin spawns `conhost.exe` to provide Win32 Console APIs to the child process. Uses Python scripts (`win32_resizer.py`) to hide the conhost window and handle resize via `SetConsoleScreenBufferSize`.

- Requires Python 3.10+ with `psutil`, `pywinctl`, `pywin32`
- `isatty()` still returns false on the pipes between plugin and conhost
- Window may flash briefly before Python hides it
- No true PTY -- just console API wrapping

Verdict: **Works but heavy dependency (Python), not a true PTY.**

### 4. ConPTY via FFI (Koffi)

Call Windows `CreatePseudoConsole` API directly via FFI library. Avoids node-pty entirely.

- Koffi is N-API context-aware (would load in Electron)
- But requires implementing significant plumbing: pipe management, process spawning with pseudo console handle, data read/write loops
- Hundreds of lines of low-level Windows API code

Verdict: **Cleanest architecture, but very high implementation effort.**

### 5. PTY Sidecar Process (Chosen Solution)

```
Plugin (Electron) --IPC--> node pty-host.js (system Node.js) --node-pty--> powershell.exe
                                                                  (real ConPTY)
```

Spawn `pty-host.js` as a separate process using the **system Node.js** (not Electron). Since it runs in a plain Node.js context:

- node-pty prebuilt binaries match (compiled for Node.js, running on Node.js)
- No context-aware issue (not in Electron renderer)
- No ABI mismatch (not using Electron's Node)
- No rebuild needed, no Python, no external windows

This is the same architecture VS Code uses -- its terminal backend runs in a separate "pty host" process, not in the renderer.

Verdict: **Simple, robust, true PTY. Chosen solution.**

## What We Built

### Architecture

```
Obsidian (Electron renderer)
  └── main.js (plugin)
        └── terminal-view.ts
              └── child_process.spawn("node", ["pty-host.js"], {
                    stdio: ["pipe", "pipe", "pipe", "ipc"]
                  })
                    └── pty-host.js (system Node.js process)
                          └── node-pty.spawn("powershell.exe", {
                                name: "xterm-256color",
                                cols: 80, rows: 24
                              })
                                └── Real ConPTY ↔ PowerShell
```

### Files

| File | Role |
|------|------|
| `pty-host.js` | Standalone Node.js script, runs outside Electron. Imports node-pty, communicates via IPC. |
| `node_modules/node-pty/` | Shipped alongside plugin with prebuilt win32-x64 binaries. Loaded by pty-host.js under system Node.js. |
| `src/terminal-view.ts` | Spawns pty-host.js, forwards xterm.js data bidirectionally via IPC messages. Falls back to basic shell if node/pty-host unavailable. |

### IPC Protocol

Plugin sends to pty-host.js:

| Message | Fields | Purpose |
|---------|--------|---------|
| `spawn` | `shell, args, cwd, cols, rows` | Start a shell process |
| `write` | `data` | Forward keyboard input to PTY |
| `resize` | `cols, rows` | Resize PTY dimensions |
| `kill` | -- | Kill PTY and exit sidecar |

pty-host.js sends to plugin:

| Message | Fields | Purpose |
|---------|--------|---------|
| `ready` | -- | Sidecar loaded, ready for spawn command |
| `spawned` | -- | Shell process started |
| `data` | `data` | PTY output (forwarded to xterm.js) |
| `exit` | `exitCode, signal` | Shell process exited |
| `error` | `message` | Error description |

### Fallback

If `node` is not in PATH or pty-host.js fails, the plugin falls back to `child_process.spawn()` with forced-interactive flags. This gives basic command execution without PTY features.

### Requirement

System Node.js must be installed. This is reasonable because:
- Claude CLI requires Node.js
- Any developer using a terminal plugin likely has Node.js
- The plugin warns clearly if the sidecar fails

## Comparison

| | Direct node-pty | conhost+Python | Sidecar (ours) | VS Code |
|---|---|---|---|---|
| True PTY | Yes | No (pipes) | Yes | Yes |
| `isatty()` | true | false | true | true |
| Colors | Full | Partial | Full | Full |
| Interactive programs | Yes | Limited | Yes | Yes |
| Claude CLI | Yes | Maybe | Yes | Yes |
| Resize | Yes | Via Python | Yes | Yes |
| External dependency | Electron rebuild | Python 3.10+ | System Node.js | Built-in |
| Survives Obsidian updates | No (ABI breaks) | Yes | Yes | N/A |
| External window | No | Hidden (flickers) | No | No |
