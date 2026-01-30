# Shell Selection

## Overview
The plugin supports multiple shells via a settings-based selection. Users pick their default shell from platform-filtered presets in **Settings > Integrated Terminal**, or enter a custom shell path.

## Implementation

### Settings UI (`src/settings.ts`)
- **Shell dropdown** — platform-filtered presets:
  - **Windows:** PowerShell, PowerShell 7 (pwsh), CMD, Git Bash, WSL
  - **macOS:** Bash, Zsh, PowerShell 7 (pwsh)
  - **Linux:** Bash, Zsh, PowerShell 7 (pwsh)
- **Custom shell path** — text input, shown when "Custom..." is selected from the dropdown
- **Shell arguments** — space-separated args passed to the shell (e.g. `--login`)
- Preset selection auto-applies the preset's default args

### Shell presets (`SHELL_PRESETS` array)
```typescript
interface ShellPreset {
    label: string;
    executable: string;
    args: string[];
    platform: NodeJS.Platform[];
}
```

Each preset defines an executable, default arguments, and which platforms it appears on.

### Default shell logic (`getDefaultSettings()`)
- **win32** → `powershell`
- **darwin** → `/bin/zsh --login`
- **linux** → `/bin/bash --login`

### Terminal spawning (`src/terminal-view.ts`)
- `spawnShell()` reads `plugin.settings.defaultShell` and `defaultShellArgs`
- Primary path: spawns `pty-host.js` sidecar with IPC, sends the shell config on the `"ready"` message
- Fallback path: if the sidecar fails, spawns the shell directly via `child_process.spawn` with platform-appropriate flags (`-NoExit` for PowerShell, `-i` for bash/zsh, `/K` for cmd)

## Design Decisions
- **Settings-based, not a picker menu** — shell choice is persistent across sessions; users set it once rather than choosing each time
- **No shell availability detection** — presets are shown based on platform, not disk probing; if a shell isn't installed, the spawn fails gracefully with an error message in the terminal
- **Custom shell escape hatch** — the "Custom..." option lets users point to any executable (e.g. `/usr/bin/fish`, `nushell`)
