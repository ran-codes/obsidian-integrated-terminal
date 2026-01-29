import { ItemView, Modal, WorkspaceLeaf, Menu, App } from "obsidian";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type TerminalPlugin from "./main";
import type { TerminalPluginSettings } from "./settings";

export const VIEW_TYPE_TERMINAL = "vs-code-terminal";

let terminalCounter = 0;

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
		input.style.width = "100%";
		input.style.marginBottom = "1em";
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
	ptyProcess: any = null;
	customName: string | null = null;
	terminalNumber: number;
	private resizeObserver: ResizeObserver | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TerminalPlugin) {
		super(leaf);
		this.plugin = plugin;
		this.terminalNumber = ++terminalCounter;
	}

	getViewType(): string {
		return VIEW_TYPE_TERMINAL;
	}

	getDisplayText(): string {
		return this.customName || `Terminal ${this.terminalNumber}`;
	}

	getIcon(): string {
		return "terminal";
	}

	async onOpen(): Promise<void> {
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

		// Fit after a brief delay to ensure the DOM is laid out
		setTimeout(() => {
			this.fitAddon?.fit();
		}, 50);

		// Watch for container size changes
		this.resizeObserver = new ResizeObserver(() => {
			this.fitAddon?.fit();
		});
		this.resizeObserver.observe(terminalEl);

		// Spawn the shell
		this.spawnShell(settings);
	}

	private spawnShell(settings: TerminalPluginSettings): void {
		const vaultPath = (this.app.vault.adapter as any).getBasePath?.()
			|| process.cwd();

		try {
			// Try node-pty first for full PTY support
			const pty = require("node-pty");

			const shell = settings.defaultShell;
			const args = settings.defaultShellArgs;

			this.ptyProcess = pty.spawn(shell, args, {
				name: "xterm-256color",
				cwd: vaultPath,
				env: { ...process.env, TERM: "xterm-256color" },
				cols: this.terminal?.cols || 80,
				rows: this.terminal?.rows || 24,
			});

			// PTY stdout -> xterm
			this.ptyProcess.onData((data: string) => {
				this.terminal?.write(data);
			});

			// xterm input -> PTY stdin
			this.terminal?.onData((data: string) => {
				this.ptyProcess?.write(data);
			});

			// Resize PTY when terminal resizes
			this.terminal?.onResize(({ cols, rows }: { cols: number; rows: number }) => {
				this.ptyProcess?.resize(cols, rows);
			});

			// Handle PTY exit
			this.ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
				this.terminal?.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
				this.ptyProcess = null;
			});
		} catch {
			// Fallback: child_process.spawn with pipes
			this.spawnFallback(settings, vaultPath);
		}
	}

	private spawnFallback(settings: TerminalPluginSettings, cwd: string): void {
		const { spawn } = require("child_process");

		const shell = settings.defaultShell;
		const args = [...settings.defaultShellArgs];

		// Force interactive mode hints for common shells
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

		this.ptyProcess = {
			_proc: proc,
			write: (data: string) => proc.stdin?.write(data),
			resize: () => {},
			kill: () => proc.kill(),
		};

		proc.stdout?.on("data", (data: Buffer) => {
			this.terminal?.write(data.toString());
		});

		proc.stderr?.on("data", (data: Buffer) => {
			this.terminal?.write(data.toString());
		});

		this.terminal?.onData((data: string) => {
			proc.stdin?.write(data);
		});

		proc.on("exit", (code: number | null) => {
			this.terminal?.write(`\r\n\x1b[90m[Process exited with code ${code ?? "unknown"}]\x1b[0m\r\n`);
			this.ptyProcess = null;
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
							(this.leaf as any).updateHeader?.();
						}
					).open();
				});
		});

		super.onPaneMenu(menu, "more-options");
	}

	async onClose(): Promise<void> {
		this.resizeObserver?.disconnect();
		this.resizeObserver = null;

		if (this.ptyProcess) {
			try {
				if (this.ptyProcess.kill) this.ptyProcess.kill();
				if (this.ptyProcess._proc) this.ptyProcess._proc.kill();
			} catch {
				// Process may already be dead
			}
			this.ptyProcess = null;
		}

		if (this.terminal) {
			this.terminal.dispose();
			this.terminal = null;
		}

		this.fitAddon = null;
	}
}
