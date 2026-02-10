# Integrated Terminal

Obsidian community plugin that provides a lightweight integrated terminal embedded directly in the workspace, with Claude Code integration and a `.claude` dotfolder sidebar.

## Rules

- Be Concise - i like quick responses to iterate quickly. Save long responses for when asked about details or planning.
- Tool use
  - **Minimize tool calls.** Use Grep, Read, Glob directly — they're fast and parallel. Never spawn a Task agent (subagent) for simple file reads or searches.
  - **No heavyweight agents for simple operations.** If a skill just needs to read/grep a handful of files, do it inline. If you think a Task agent is needed, ask me first.

## Quick Start

```bash
npm install
npm run build        # production build → main.js
npm run dev          # watch mode for development
```

Deploy to a vault: use `/local-deploy` skill for automated deployment.

## Iteration Workflow

After any code change, always:
1. `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css`, `pty-host.js`, and `plugin-reference.md` (as `CLAUDE.md`) to `D:/GitHub/work/.obsidian/plugins/integrated-terminal/`
3. Copy `node_modules/node-pty` to `D:/GitHub/work/.obsidian/plugins/integrated-terminal/node_modules/`

Do not wait for the user to call `/local-deploy` — build and deploy automatically after each change.
