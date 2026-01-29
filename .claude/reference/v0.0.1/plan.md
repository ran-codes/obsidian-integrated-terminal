# Obsidian VS Code Terminal Plugin - Implementation Plan

## Overview

Build a lightweight Obsidian plugin that opens an integrated terminal (like VS Code's `Ctrl+``) as a tab in the editor area. Ribbon icon to open, configurable shell, multiple terminal tabs, tab renaming.

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scaffold | Copy from `obsidian-sample-plugin` template | Official approach; no CLI/npm init exists |
| Terminal UI | `xterm.js` + `xterm-addon-fit` | Same lib VS Code uses |
| Shell process | `node-pty` (native PTY) | Required for interactive terminal (colors, tab completion, prompt). `child_process.spawn` with pipes does NOT give interactive mode |
| Panel placement | Main editor tab | User's choice; most native to Obsidian |
| node-pty risk | Mark external in esbuild, ship native binaries | Native modules need special handling in Obsidian/Electron. If node-pty fails to load at runtime, we pivot to `child_process.spawn` with forced-interactive flags as fallback |

## Files to Create/Modify

```
obsidian-vs-code-terminal/
  .gitignore               # NEW - ignore tmpclaude-*, node_modules, main.js
  .editorconfig            # NEW - from template
  .npmrc                   # NEW - from template
  package.json             # NEW - deps: obsidian, xterm, @xterm/addon-fit, node-pty
  tsconfig.json            # NEW - from template
  esbuild.config.mjs       # NEW - from template, add node-pty to externals
  manifest.json            # NEW - id: "vs-code-terminal", isDesktopOnly: true
  versions.json            # NEW - version mapping
  styles.css               # NEW - terminal container + xterm overrides
  src/
    main.ts                # NEW - plugin entry, ribbon icon, commands, settings tab
    terminal-view.ts       # NEW - ItemView subclass, xterm.js + node-pty integration
    settings.ts            # NEW - settings interface + PluginSettingTab
```

---

## Implementation Steps

### Step -1: Documentation Setup

1. Create `.claude/reference/v0.0.1/plan.md` -- backup of this plan
2. Create `.claude/reference/v0.0.1/prd.md` -- concise PRD summary

### Step 0: Git Housekeeping

Create `.gitignore`:
```
node_modules/
main.js
data.json
tmpclaude-*
*.js.map
```

### Step 1: Scaffold Project

Copy these files from `obsidian-sample-plugin` template and customize:

**`manifest.json`**:
```json
{
  "id": "vs-code-terminal",
  "name": "VS Code Terminal",
  "version": "0.1.0",
  "minAppVersion": "0.15.0",
  "description": "Lightweight integrated terminal for Obsidian, inspired by VS Code.",
  "author": "rl627",
  "isDesktopOnly": true
}
```
- `isDesktopOnly: true` because terminal requires Node.js APIs (child_process, node-pty)

**`package.json`** dependencies:
```json
{
  "dependencies": {
    "obsidian": "latest"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "~5.8.0",
    "esbuild": "~0.25.0",
    "xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "node-pty": "^1.0.0"
  }
}
```

**`esbuild.config.mjs`**: Based on template, with additions:
- Add `node-pty` to the `external` array (cannot be bundled - native module)
- Keep existing externals: `obsidian`, `electron`, `@codemirror/*`, `@lezer/*`

**`tsconfig.json`**, **`.editorconfig`**, **`.npmrc`**, **`versions.json`**, **`version-bump.mjs`**: Copy from template as-is.

### Step 2: Settings (`src/settings.ts`)

```typescript
interface TerminalPluginSettings {
  defaultShell: string;        // e.g., "powershell", "pwsh", "bash"
  defaultShellArgs: string[];  // e.g., ["--login"]
  fontSize: number;            // default: 14
  fontFamily: string;          // default: "monospace"
}
```

Settings tab with:
- **Shell executable** dropdown: PowerShell, PowerShell 7 (pwsh), CMD, Git Bash, WSL, Bash, Zsh, Custom
- **Shell arguments** text field
- **Font size** slider (8-24, default 14)
- **Font family** text field

Default shell auto-detected based on `process.platform`:
- `win32` -> `"powershell"`
- `darwin` -> `"/bin/zsh"`
- `linux` -> `"/bin/bash"`

### Step 3: Terminal View (`src/terminal-view.ts`)

`TerminalView extends ItemView`:

**`onOpen()`:**
1. Create a container `div` in `this.contentEl`
2. Initialize `xterm.Terminal` with font settings from plugin settings
3. Load `FitAddon` and call `fit()` for responsive sizing
4. Spawn shell via `node-pty.spawn(shell, args, { cwd: vaultPath, env: process.env })`
5. Wire bidirectional data: `pty.onData -> terminal.write`, `terminal.onData -> pty.write`
6. Wire resize: `terminal.onResize -> pty.resize`

**`onClose()`:**
1. Kill the PTY process (`pty.kill()`)
2. Dispose xterm.js instance (`terminal.dispose()`)

**`onResize()`:**
1. Call `fitAddon.fit()` to recalculate dimensions

**Tab identity:**
- `getViewType()` returns `"vs-code-terminal"`
- `getDisplayText()` returns custom name or `"Terminal"` + counter
- `getIcon()` returns `"terminal"`

**Tab renaming (`onPaneMenu()`):**
- Add "Rename terminal" menu item
- On click, show a small `Modal` with a text input
- Store custom name on the view instance
- Call `this.leaf.updateHeader()` to refresh the tab title after rename

### Step 4: Plugin Entry (`src/main.ts`)

**`onload()`:**
1. Load settings from disk (`this.loadData()`)
2. Register view type: `this.registerView("vs-code-terminal", leaf => new TerminalView(leaf, this))`
3. Add ribbon icon: `this.addRibbonIcon("terminal", "Open Terminal", () => this.openNewTerminal())`
4. Register commands:
   - `open-terminal`: Open a new terminal tab (no default hotkey)
   - `toggle-terminal`: Focus/unfocus terminal (default hotkey: `Ctrl+``)
5. Add settings tab: `this.addSettingTab(new TerminalSettingTab(this.app, this))`

**`openNewTerminal()`:**
- `const leaf = this.app.workspace.getLeaf('tab')`
- `await leaf.setViewState({ type: "vs-code-terminal", active: true })`
- `this.app.workspace.revealLeaf(leaf)`

**`toggleTerminal()`:**
- Find existing terminal leaves: `this.app.workspace.getLeavesOfType("vs-code-terminal")`
- If terminal exists and is active: focus back to previous editor leaf
- If terminal exists but not active: `revealLeaf(terminalLeaf)`
- If no terminal exists: call `openNewTerminal()`

**`onunload()`:**
- Detach all terminal leaves (kills PTY processes via `onClose`)

### Step 5: Styles (`styles.css`)

```css
/* Terminal container fills the entire view */
.terminal-view-container {
  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
}

/* xterm.js overrides for Obsidian integration */
.terminal-view-container .xterm {
  height: 100%;
  padding: 4px;
}

/* Import xterm.js base CSS (bundled or inlined) */
```

Theme integration: Read Obsidian CSS variables (`--background-primary`, `--text-normal`, etc.) to set xterm.js theme colors so the terminal matches light/dark mode.

### Step 6: Build & Test

1. `npm install`
2. Verify node-pty native module compiled/downloaded correctly
3. `npm run build` - check for TypeScript errors and successful bundle
4. Copy output to a test vault's `.obsidian/plugins/vs-code-terminal/` folder
5. Test in Obsidian:
   - Ribbon icon opens a terminal tab
   - Shell prompt appears and commands execute
   - Colors render correctly
   - Multiple terminals can be opened as separate tabs
   - Right-click tab -> Rename works
   - `Ctrl+`` toggles focus to/from terminal
   - Settings page shows shell options, font size
   - Changing settings and reopening terminal applies new settings
   - Closing tab kills the shell process (no orphan processes)
   - Resizing the pane resizes the terminal

---

## node-pty Fallback Plan

If `node-pty` fails to load in Obsidian's Electron runtime:

**Fallback: `child_process.spawn` with forced-interactive shell**
- Windows: `child_process.spawn('powershell', ['-NoExit', '-Command', '-'], { stdio: 'pipe' })`
- macOS/Linux: `child_process.spawn('bash', ['-i'], { stdio: 'pipe' })`
- Limitations: no PTY (reduced colors, no vim/less, limited line editing)
- This gives a functional terminal for running commands, even if not full VS Code parity

**Upgrade path (v2):** Ship platform-specific PTY helper binaries or investigate `node-pty` prebuilt binaries for the target Electron ABI.

---

## Verification Checklist

- [ ] `npm run build` succeeds with no errors
- [ ] Plugin loads in Obsidian without console errors
- [ ] Ribbon icon visible and opens terminal tab
- [ ] Shell prompt appears (PowerShell on Windows)
- [ ] Can type commands and see output
- [ ] Colored output renders correctly
- [ ] `Ctrl+`` toggles terminal focus
- [ ] Multiple terminal tabs work independently
- [ ] Tab rename works via right-click menu
- [ ] Settings page renders with shell/font options
- [ ] Terminal resizes when pane is resized
- [ ] Closing tab kills the shell process
- [ ] No orphan processes after disabling plugin
