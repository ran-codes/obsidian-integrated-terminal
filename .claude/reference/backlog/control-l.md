# Fix Ctrl+L Terminal Clearing (NOT FIXED)

## Root Cause

The current Ctrl+L handler (line 126) calls `this.terminal.clear()` which only clears the **xterm.js JavaScript buffer**. On Windows, node-pty uses **ConPTY**, which maintains its own separate viewport buffer. When the shell outputs anything after the clear (even just redrawing the prompt), ConPTY repaints from its stale buffer, causing old content to reappear. The shell itself never receives the `\x0c` keystroke because `stopImmediatePropagation()` + `preventDefault()` swallow it.

## Fix

Two edits in **`src/terminal-view.ts`**:

### 1. Ctrl+L handler (lines 123-127)

Add a `\x0c` write to the PTY before calling `terminal.clear()`:

```typescript
if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "l") {
	e.stopImmediatePropagation();
	e.preventDefault();
	// Send Ctrl+L to the shell so it clears through ConPTY properly
	if (this.ptyHost?.connected) {
		this.ptyHost.send({ type: "write", data: "\x0c" });
	}
	this.terminal.clear();
}
```

- `\x0c` goes to shell via PTY -> shell runs its native clear-screen (PSReadLine ClearScreen, readline clear-screen, etc.) -> ConPTY viewport buffer is properly updated
- `terminal.clear()` still runs to wipe xterm.js scrollback

### 2. Fallback shell `send` shim (lines 272-273)

The fallback's `send` is currently a no-op `() => {}`. Fix it to forward writes to stdin:

```typescript
send: (msg: any) => {
    if (msg.type === "write" && proc.stdin) {
        proc.stdin.write(msg.data);
    }
},
```

This makes Ctrl+L work even when node-pty is unavailable.

## Build & Deploy

1. `npm run build`
2. Run `/local-deploy` skill
3. Reload Obsidian (Ctrl+P -> "Reload app without saving")

## Verify

1. Open terminal, run commands to generate output
2. Press Ctrl+L
3. Confirm: screen clears, fresh prompt appears, no old content reappears
4. Scroll up to confirm scrollback is also cleared
