# Integrated Terminal

A lightweight integrated terminal for Obsidian, embedded directly in your workspace.

## Usage

- Use the command palette to run **Integrated Terminal: Toggle terminal** or **Open new terminal**
- Click the terminal icon in the ribbon (left sidebar)

## Recommended setup

For a VS Code-like experience, add these keybindings in **Settings > Hotkeys**:

| Command | Hotkey |
|---------|--------|
| Integrated Terminal: Toggle terminal | `Ctrl + `` ` |

To free up `Ctrl+P` for the command palette (like VS Code), add this to your
`.obsidian/hotkeys.json`:

```json
{
  "command-palette:open": [
    {
      "modifiers": ["Mod", "Shift"],
      "key": "P"
    }
  ],
  "switcher:open": [
    {
      "modifiers": ["Mod"],
      "key": "P"
    }
  ]
}
```

## Features

- Open a terminal panel inside Obsidian
- Multiple terminal tabs with rename support
- Theming that adapts to your Obsidian appearance
- `.claude` dotfolder sidebar — browse and edit files from the `.claude` folder that Obsidian's native explorer hides, with auto-refresh on changes

## Installation

Search for **Integrated Terminal** in Obsidian's community plugins browser.
