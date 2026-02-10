# Integrated Terminal Plugin

This Obsidian vault has the **Integrated Terminal** plugin installed. It provides an embedded terminal and Claude Code integration directly inside Obsidian.

## Commands

| Command | ID | Description |
|---------|----|-------------|
| Open new terminal | `integrated-terminal:open-terminal` | Opens a new terminal tab (named "Terminal 1", "Terminal 2", etc.) |
| Toggle terminal | `integrated-terminal:toggle-terminal` | Focus/open a terminal |
| Open Claude Code terminal | `integrated-terminal:open-claude-terminal` | Opens a terminal that auto-runs `claude` CLI (named "Assistant", "Assistant 2", etc.) |
| Show .claude files | `integrated-terminal:show-claude-files` | Opens sidebar view of the `.claude` dotfolder |

## Features

- **Multiple terminal tabs** with independent sessions and rename support
- **Shell selection** — configurable default shell (PowerShell, pwsh, CMD, Git Bash, WSL, Bash, Zsh)
- **Theme sync** — terminal colors match Obsidian theme automatically
- **`.claude` sidebar** — browse/edit `.claude` folder contents that Obsidian's file explorer hides
