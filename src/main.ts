import { Plugin, WorkspaceLeaf } from "obsidian";
import { TerminalView, VIEW_TYPE_TERMINAL } from "./terminal-view";
import { TerminalSettingTab, TerminalPluginSettings, getDefaultSettings } from "./settings";

export default class TerminalPlugin extends Plugin {
	settings: TerminalPluginSettings = getDefaultSettings();
	private lastActiveEditorLeaf: WorkspaceLeaf | null = null;

	async onload() {
		await this.loadSettings();

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
		this.addRibbonIcon("terminal", "Open Terminal", () => {
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

	async openNewTerminal() {
		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: VIEW_TYPE_TERMINAL,
			active: true,
		});
		this.app.workspace.revealLeaf(leaf);
	}

	toggleTerminal() {
		const terminalLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_TERMINAL);
		const activeLeaf = this.app.workspace.activeLeaf;

		if (activeLeaf && activeLeaf.view.getViewType() === VIEW_TYPE_TERMINAL) {
			// Currently focused on a terminal -- switch back to last editor
			if (this.lastActiveEditorLeaf) {
				this.app.workspace.revealLeaf(this.lastActiveEditorLeaf);
				this.lastActiveEditorLeaf.view?.containerEl
					?.querySelector<HTMLElement>(".cm-editor")
					?.focus();
			}
		} else if (terminalLeaves.length > 0) {
			// Terminal exists but not focused -- focus the most recent one
			this.app.workspace.revealLeaf(terminalLeaves[terminalLeaves.length - 1]);
		} else {
			// No terminal exists -- open one
			this.openNewTerminal();
		}
	}

	async loadSettings() {
		const saved = await this.loadData();
		this.settings = Object.assign(getDefaultSettings(), saved || {});
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
