import { Plugin, WorkspaceLeaf, addIcon } from "obsidian";
import { TerminalView, VIEW_TYPE_TERMINAL } from "./terminal-view";
import { ClaudeFilesView, VIEW_TYPE_CLAUDE_FILES } from "./claude-files-view";
import { TerminalSettingTab, TerminalPluginSettings, getDefaultSettings } from "./settings";

export default class TerminalPlugin extends Plugin {
	settings: TerminalPluginSettings = getDefaultSettings();
	private lastActiveEditorLeaf: WorkspaceLeaf | null = null;

	async onload() {
		await this.loadSettings();

		// Register custom Claude icon (spark/asterisk shape)
		addIcon("claude", `<circle cx="50" cy="50" r="7" fill="currentColor"/><g fill="currentColor"><rect x="46" y="8" width="8" height="28" rx="4"/><rect x="46" y="64" width="8" height="28" rx="4"/><rect x="46" y="8" width="8" height="28" rx="4" transform="rotate(60,50,50)"/><rect x="46" y="64" width="8" height="28" rx="4" transform="rotate(60,50,50)"/><rect x="46" y="8" width="8" height="28" rx="4" transform="rotate(120,50,50)"/><rect x="46" y="64" width="8" height="28" rx="4" transform="rotate(120,50,50)"/></g>`);

		// Track last active editor leaf for toggle behavior
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf && leaf.view.getViewType() !== VIEW_TYPE_TERMINAL) {
					this.lastActiveEditorLeaf = leaf;
				}
			})
		);

		// Register the terminal view type
		this.registerView(VIEW_TYPE_TERMINAL, (leaf) => new TerminalView(leaf, this));

		// Ribbon icon - opens a new terminal
		this.addRibbonIcon("square-terminal", "Integrated Terminal", () => {
			this.openNewTerminal();
		});

		// Command: open new terminal
		this.addCommand({
			id: "open-terminal",
			name: "Open new terminal",
			callback: () => {
				this.openNewTerminal();
			},
		});

		// Command: toggle terminal (focus/unfocus)
		this.addCommand({
			id: "toggle-terminal",
			name: "Toggle terminal",
			hotkeys: [{ modifiers: ["Ctrl"], key: "`" }],
			callback: () => {
				this.toggleTerminal();
			},
		});

		// Register the .claude files sidebar view
		this.registerView(VIEW_TYPE_CLAUDE_FILES, (leaf) => new ClaudeFilesView(leaf, this));

		// Ribbon icon for .claude files
		this.addRibbonIcon("claude", "Show .claude files", () => {
			this.showClaudeFilesView();
		});

		// Command: show .claude files
		this.addCommand({
			id: "show-claude-files",
			name: "Show .claude files",
			callback: () => {
				this.showClaudeFilesView();
			},
		});

		// Auto-open .claude view on startup if the folder exists
		this.app.workspace.onLayoutReady(async () => {
			const exists = await this.app.vault.adapter.exists(".claude");
			if (exists) {
				const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE_FILES);
				if (existing.length === 0) {
					this.showClaudeFilesView();
				}
			}
		});

		// Settings tab
		this.addSettingTab(new TerminalSettingTab(this.app, this));
	}

	async onunload() {
		// Close all terminal views (triggers onClose which kills PTY processes)
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
		for (const leaf of leaves) {
			leaf.detach();
		}
	}

	async showClaudeFilesView() {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_CLAUDE_FILES);
		if (existing.length > 0) {
			this.app.workspace.revealLeaf(existing[0]);
			return;
		}
		const leaf = this.app.workspace.getLeftLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_CLAUDE_FILES,
				active: true,
			});
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async openNewTerminal() {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_TERMINAL,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
	}

	toggleTerminal() {
		this.openNewTerminal();
	}

	async loadSettings() {
		const saved = await this.loadData();
		this.settings = Object.assign(getDefaultSettings(), saved || {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
