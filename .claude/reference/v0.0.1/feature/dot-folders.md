# Feature: Dotfolder Sidebar View (.claude)

## Goal
Add a custom sidebar view to the plugin that shows the `.claude` folder contents in a file tree, allowing users to browse and edit files that Obsidian's native file explorer hides.

## Approach
Use Obsidian's public `ItemView` + `DataAdapter.list()` APIs to build a dedicated sidebar panel. No monkey-patching of Obsidian internals.

## Files to modify/create

| File | Action |
|------|--------|
| `src/claude-files-view.ts` | **Create** - New sidebar view class |
| `src/main.ts` | **Edit** - Register view, add ribbon icon, add command, auto-open on startup |
| `styles.css` | **Edit** - Add tree styling |

## Implementation

### 1. `src/claude-files-view.ts` — New file

- Export `VIEW_TYPE_CLAUDE_FILES = "claude-files"`
- `ClaudeFilesView extends ItemView`:
  - `getViewType()` → `"claude-files"`
  - `getDisplayText()` → `".claude"`
  - `getIcon()` → `"folder-dot"` (or `"file-code"`)
  - `onOpen()`:
    - Build the tree by calling `renderTree()`
    - Register vault events (`create`, `delete`, `rename`, `modify`) to auto-refresh when files change inside `.claude`
  - `renderTree()`:
    - Use `this.app.vault.adapter.list('.claude')` recursively to enumerate all folders/files
    - Render a nested collapsible tree (folders as `<details><summary>`, files as clickable `<div>`)
    - Skip `.claude/.gitignore` and other non-editable files if desired
  - File click handler:
    - Use `this.app.vault.adapter.read(path)` to check the file exists
    - Open the file using `this.app.workspace.openLinkText(path, '', 'tab')` for markdown files
    - For non-markdown files (`.json`, `.md` in subfolders), create a new leaf and use the adapter to read/display
  - Context menu (right-click):
    - "Reveal in system explorer" using `require('electron').shell.showItemInFolder()`
    - "Refresh" to re-render the tree
  - `onClose()`: unregister vault event listeners

### 2. `src/main.ts` — Edits

- Import `ClaudeFilesView, VIEW_TYPE_CLAUDE_FILES`
- In `onload()`:
  - `this.registerView(VIEW_TYPE_CLAUDE_FILES, (leaf) => new ClaudeFilesView(leaf, this))`
  - Add command `"show-claude-files"` / `"Show .claude files"`
  - Add ribbon icon (folder-dot or similar)
  - On `workspace.onLayoutReady`, auto-open the view in left sidebar if `.claude` folder exists

### 3. `styles.css` — Edits

- `.claude-files-container` — padding, overflow
- `.claude-tree-folder` — folder row styling, collapse/expand icon
- `.claude-tree-file` — file row styling, hover highlight, click cursor
- `.claude-tree-indent` — nested indentation
- Use Obsidian CSS variables (`--text-normal`, `--background-secondary-alt`, etc.) for theme consistency

## Verification
1. Build with `npm run build`
2. Deploy to vault using `/local-deploy`
3. Reload Obsidian
4. Confirm ".claude" panel appears in the left sidebar
5. Confirm folder tree renders with correct hierarchy
6. Click a file — confirm it opens in the editor
7. Add/delete a file in `.claude` from terminal — confirm tree auto-refreshes
