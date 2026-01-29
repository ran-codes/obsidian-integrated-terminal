# VS Code Terminal for Obsidian - PRD

## Problem

Existing obsidian-terminal plugin (polyipseity) is over-engineered: profile picker on every open, no tab renaming, Python dependency, developer console emulation, i18n, 4500+ lines across dozens of files. Users just want a terminal.

## Goal

One-click integrated terminal in Obsidian. Click ribbon icon, get a shell. Done.

## Must Have (v1)

| Feature | Detail |
|---------|--------|
| One-click open | Ribbon icon opens default shell as editor tab (no picker) |
| Default shell | Settings dropdown: PowerShell, pwsh, CMD, Git Bash, WSL, Bash, Zsh |
| Multiple terminals | Each opens as a separate tab |
| Rename tabs | Right-click tab -> rename (e.g., "dev server", "git") |
| Toggle focus | Ctrl+` keyboard shortcut |
| Working directory | Opens at vault root |

## Out of Scope

Dev console emulation, Python deps, i18n, profile picker, history export, external terminal launching.

## Tech Stack

| Dep | Purpose |
|-----|---------|
| xterm.js | Terminal UI (same as VS Code) |
| @xterm/addon-fit | Auto-resize terminal to container |
| node-pty | Native PTY for interactive shell |
| Obsidian Plugin API | ItemView, Plugin, PluginSettingTab |

## Architecture

```
src/main.ts          -> Plugin lifecycle, ribbon icon, commands, settings tab
src/terminal-view.ts -> ItemView subclass, xterm.js + node-pty wiring
src/settings.ts      -> Settings interface + UI
styles.css           -> Terminal container + Obsidian theme integration
```

## Core Flow

1. User clicks ribbon icon or presses Ctrl+`
2. Plugin creates WorkspaceLeaf with TerminalView
3. TerminalView.onOpen() initializes xterm.js + spawns PTY
4. Bidirectional: PTY stdout -> xterm.write, xterm.onData -> PTY stdin
5. Tab close -> kill PTY process

## Risk

node-pty is a native module that may not load in Obsidian's Electron. Fallback: child_process.spawn with forced-interactive flags (reduced functionality).
