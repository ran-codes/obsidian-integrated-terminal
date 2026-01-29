# Shell Picker Feature

## Overview
Add a VS Code-style shell picker to the ribbon icon. Clicking it shows a dropdown menu listing available shells for the current platform. Selecting one opens a new terminal with that shell. Ctrl+` continues to open with the default shell.

## Files to Modify

### 1. `src/settings.ts` -- Export presets
- Add `export` to `interface ShellPreset` and `const SHELL_PRESETS`
- No other changes

### 2. `src/main.ts` -- Picker menu + pending shell mechanism
- Import `Menu` from obsidian, `SHELL_PRESETS` and `ShellPreset` from settings
- Add `pendingShellConfig: { shell: string; args: string[] } | null = null` property on plugin
- Change `openNewTerminal()` to `openNewTerminal(shell?, args?)` -- if provided, sets `pendingShellConfig` before creating the leaf
- Replace ribbon icon callback: show a `Menu` with platform-filtered `SHELL_PRESETS`, each item calls `openNewTerminal(preset.executable, preset.args)`

### 3. `src/terminal-view.ts` -- Consume pending config
- In `onOpen()`, read and clear `this.plugin.pendingShellConfig`
- If non-null, spread it over the default settings to build an override
- Pass the override (or default settings) to `spawnShell()`

## Design Decisions
- **Menu, not FuzzySuggestModal** -- only 3-5 items after platform filtering; a searchable modal is overkill
- **No shell availability detection** -- just show platform presets, fail gracefully at spawn (same as VS Code)
- **"Pending shell" pattern** -- needed because Obsidian calls `onOpen()` before `setState()`, so we can't pass shell choice through view state

## Verification
1. Build the plugin
2. Click ribbon icon -> menu appears with platform shells (PowerShell, pwsh, CMD, Git Bash, WSL on Windows)
3. Select a shell -> new terminal opens running that shell
4. Press Ctrl+` -> new terminal opens with default shell (no menu)
