import { ItemView, Modal, WorkspaceLeaf, Menu, App, FileSystemAdapter } from "obsidian";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import * as path from "path";
import { spawn, ChildProcess } from "child_process";
import type TerminalPlugin from "./main";
import type { TerminalPluginSettings } from "./settings";

export const VIEW_TYPE_TERMINAL = "integrated-terminal";

type PtyMessage =
	| { type: "ready" }
	| { type: "data"; data: string }
	| { type: "exit"; exitCode: number }
	| { type: "error"; message: string }
	| { type: "spawn"; shell: string; args: string[]; cwd: string; cols: number; rows: number }
	| { type: "write"; data: string }
	| { type: "resize"; cols: number; rows: number }
	| { type: "kill" };

interface PtyHost {
	connected: boolean;
	send(msg: PtyMessage): void;
	kill?(): void;
	_proc?: ChildProcess;
}

let terminalCounter = 0;
let assistantCounter = 0;

class RenameModal extends Modal {
	currentName: string;
	onSubmit: (name: string) => void;

	constructor(app: App, currentName: string, onSubmit: (name: string) => void) {
		super(app);
		this.currentName = currentName;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Rename terminal" });

		const input = contentEl.createEl("input", {
			type: "text",
			value: this.currentName,
		});
		input.addClass("rename-modal-input");
		input.focus();
		input.select();

		input.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				this.onSubmit(input.value);
				this.close();
			}
		});

		const btnContainer = contentEl.createDiv({ cls: "modal-button-container" });
		const btn = btnContainer.createEl("button", { text: "Rename", cls: "mod-cta" });
		btn.addEventListener("click", () => {
			this.onSubmit(input.value);
			this.close();
		});
	}

	onClose() {
		this.contentEl.empty();
	}
}

function getObsidianTheme(): Record<string, string> {
	const style = getComputedStyle(document.body);
	const get = (prop: string) => style.getPropertyValue(prop).trim();

	return {
		background: get("--background-primary") || "#1e1e1e",
		foreground: get("--text-normal") || "#cccccc",
		cursor: get("--text-accent") || "#528bff",
		cursorAccent: get("--background-primary") || "#1e1e1e",
		selectionBackground: get("--text-selection") || "#264f78",
	};
}

export class TerminalView extends ItemView {
	plugin: TerminalPlugin;
	terminal: Terminal | null = null;
	fitAddon: FitAddon | null = null;
	ptyHost: PtyHost | null = null;
	customName: string | null = null;
	initialCommand: string | null = null;
	isAssistant = false;
	terminalNumber: number;
	assistantNumber = 0;
	private resizeObserver: ResizeObserver | null = null;
	private _keyHandler: ((e: KeyboardEvent) => void) | null = null;
	private _themeObserver: MutationObserver | null = null;
	private _initialCommandSent = false;

	constructor(leaf: WorkspaceLeaf, plugin: TerminalPlugin) {
		super(leaf);
		this.navigation = false;
		this.plugin = plugin;
		this.terminalNumber = 0;
	}

	getViewType(): string {
		return VIEW_TYPE_TERMINAL;
	}

	getDisplayText(): string {
		if (this.customName) return this.customName;
		if (this.isAssistant) {
			return this.assistantNumber === 1 ? "Assistant" : `Assistant ${this.assistantNumber}`;
		}
		if (this.terminalNumber === 0) {
			this.terminalNumber = ++terminalCounter;
		}
		return `Terminal ${this.terminalNumber}`;
	}

	markAsAssistant(): void {
		this.isAssistant = true;
		this.assistantNumber = ++assistantCounter;
	}

	getIcon(): string {
		return this.isAssistant ? "claude" : "terminal";
	}

	onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("terminal-view-container");

		const terminalEl = container.createDiv({ cls: "terminal-wrapper" });

		const settings: TerminalPluginSettings = this.plugin.settings;
		const theme = getObsidianTheme();

		this.terminal = new Terminal({
			fontSize: settings.fontSize,
			fontFamily: settings.fontFamily,
			theme: theme,
			cursorBlink: true,
			allowProposedApi: true,
		});

		this.fitAddon = new FitAddon();
		this.terminal.loadAddon(this.fitAddon);
		this.terminal.open(terminalEl);

		// Capture terminal keyboard shortcuts at the document level
		// (Obsidian binds globally, so we must intercept before it does)
		this._keyHandler = (e: KeyboardEvent) => {
			if (!this.terminal || !document.activeElement?.closest(".terminal-view-container")) return;
			if (e.ctrlKey && !e.shiftKey && !e.altKey && e.key === "l") {
				e.stopImmediatePropagation();
				e.preventDefault();
				// Send Ctrl+L to the shell so it clears through ConPTY properly
				if (this.ptyHost?.connected) {
					this.ptyHost.send({ type: "write", data: "\x0c" });
				}
				this.terminal.clear();
			}
		};
		document.addEventListener("keydown", this._keyHandler, true);

		// Fit after a brief delay to ensure the DOM is laid out
		setTimeout(() => {
			this.fitAddon?.fit();
		}, 50);

		// Watch for container size changes
		this.resizeObserver = new ResizeObserver(() => {
			this.fitAddon?.fit();
		});
		this.resizeObserver.observe(terminalEl);

		// Watch for Obsidian theme changes (dark/light mode toggle)
		this._themeObserver = new MutationObserver(() => {
			if (this.terminal) {
				this.terminal.options.theme = getObsidianTheme();
			}
		});
		this._themeObserver.observe(document.body, {
			attributes: true,
			attributeFilter: ["class"],
		});

		// Spawn the shell via sidecar
		this.spawnShell(settings);

		return Promise.resolve();
	}

	private sendInitialCommand(): void {
		if (!this.initialCommand || this._initialCommandSent) return;
		this._initialCommandSent = true;
		const cmd = this.initialCommand;
		setTimeout(() => {
			if (this.ptyHost?.connected) {
				this.ptyHost.send({ type: "write", data: cmd + "\r" });
			}
		}, 300);
	}

	private spawnShell(settings: TerminalPluginSettings): void {
		const vaultPath = (this.app.vault.adapter as FileSystemAdapter).getBasePath?.()
			|| process.cwd();

		// Resolve plugin directory to find pty-host.js
		const pluginDir = path.join(vaultPath, this.plugin.manifest.dir!);
		const ptyHostPath = path.join(pluginDir, "pty-host.js");

		try {
			// Spawn pty-host.js as a sidecar process using system Node.js
			// stdio[3] = 'ipc' creates an IPC channel for process.send/on('message')
			const child = spawn("node", [ptyHostPath], {
				stdio: ["pipe", "pipe", "pipe", "ipc"],
				cwd: vaultPath,
				windowsHide: true,
			});

			this.ptyHost = child as unknown as PtyHost;

			// Handle IPC messages from pty-host
			child.on("message", (msg: PtyMessage) => {
				switch (msg.type) {
					case "ready":
						// PTY host is ready -- spawn the shell
						child.send({
							type: "spawn",
							shell: settings.defaultShell.includes(" ")
								? settings.defaultShell
								: settings.defaultShell + ".exe",
							args: settings.defaultShellArgs,
							cwd: vaultPath,
							cols: this.terminal?.cols || 80,
							rows: this.terminal?.rows || 24,
						});
						break;
					case "data":
						this.terminal?.write(msg.data);
						this.sendInitialCommand();
						break;
					case "exit":
						this.terminal?.write(
							`\r\n\x1b[90m[Process exited with code ${msg.exitCode}]\x1b[0m\r\n`
						);
						break;
					case "error":
						this.terminal?.write(
							`\r\n\x1b[31m[PTY error: ${msg.message}]\x1b[0m\r\n`
						);
						break;
				}
			});

			// Forward xterm input to PTY host
			this.terminal?.onData((data: string) => {
				if (this.ptyHost?.connected) {
					child.send({ type: "write", data });
				}
			});

			// Forward resize events to PTY host
			this.terminal?.onResize(({ cols, rows }: { cols: number; rows: number }) => {
				if (this.ptyHost?.connected) {
					child.send({ type: "resize", cols, rows });
				}
			});

			// Handle sidecar process errors/exit
			child.on("error", (err: Error) => {
				this.terminal?.write(
					`\r\n\x1b[33m[PTY host failed: ${err.message}. Falling back to basic shell.]\x1b[0m\r\n`
				);
				this.ptyHost = null;
				this.spawnFallback(settings, vaultPath);
			});

			child.on("exit", () => {
				this.ptyHost = null;
			});

			// Capture any stderr from the sidecar for debugging
			child.stderr?.on("data", (data: Buffer) => {
				console.warn("[pty-host stderr]", data.toString());
			});
		} catch {
			this.spawnFallback(settings, vaultPath);
		}
	}

	private spawnFallback(settings: TerminalPluginSettings, cwd: string): void {
		const shell = settings.defaultShell;
		const args = [...settings.defaultShellArgs];

		if (shell === "powershell" || shell === "pwsh") {
			if (!args.includes("-NoExit")) args.unshift("-NoExit");
		} else if (shell.includes("bash") || shell === "zsh") {
			if (!args.includes("-i")) args.push("-i");
		} else if (shell === "cmd") {
			if (!args.includes("/K")) args.unshift("/K");
		}

		this.terminal?.write("\x1b[33m[node-pty unavailable, using basic shell]\x1b[0m\r\n");

		const proc = spawn(shell, args, {
			cwd: cwd,
			env: { ...process.env, TERM: "xterm-256color" },
			shell: false,
			windowsHide: false,
		});

		this.ptyHost = {
			_proc: proc,
			connected: true,
			send: (msg: PtyMessage) => {
				if (msg.type === "write" && proc.stdin) {
					proc.stdin.write(msg.data);
				}
			},
			kill: () => { proc.kill(); },
		};

		proc.stdout?.on("data", (data: Buffer) => {
			this.terminal?.write(data.toString());
			this.sendInitialCommand();
		});

		proc.stderr?.on("data", (data: Buffer) => {
			this.terminal?.write(data.toString());
		});

		this.terminal?.onData((data: string) => {
			proc.stdin?.write(data);
		});

		proc.on("exit", (code: number | null) => {
			this.terminal?.write(
				`\r\n\x1b[90m[Process exited with code ${code ?? "unknown"}]\x1b[0m\r\n`
			);
			this.ptyHost = null;
		});
	}

	onResize(): void {
		this.fitAddon?.fit();
	}

	onPaneMenu(menu: Menu): void {
		menu.addItem((item) => {
			item.setTitle("Rename terminal")
				.setIcon("pencil")
				.onClick(() => {
					new RenameModal(
						this.app,
						this.getDisplayText(),
						(name: string) => {
							this.customName = name || null;
							(this.leaf as WorkspaceLeaf & { updateHeader?: () => void }).updateHeader?.();
						}
					).open();
				});
		});

		super.onPaneMenu(menu, "more-options");
	}

	onClose(): Promise<void> {
		if (this._keyHandler) {
			document.removeEventListener("keydown", this._keyHandler, true);
			this._keyHandler = null;
		}

		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		this._themeObserver?.disconnect();
		this._themeObserver = null;

		if (this.ptyHost) {
			try {
				if (this.ptyHost.connected) {
					this.ptyHost.send({ type: "kill" });
				} else if (this.ptyHost.kill) {
					this.ptyHost.kill();
				}
				if (this.ptyHost._proc) {
					this.ptyHost._proc.kill();
				}
			} catch {
				// Process may already be dead
			}
			this.ptyHost = null;
		}

		if (this.terminal) {
			this.terminal.dispose();
			this.terminal = null;
		}

		this.fitAddon = null;

		return Promise.resolve();
	}
}
