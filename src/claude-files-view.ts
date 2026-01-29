import { ItemView, WorkspaceLeaf, Menu, TAbstractFile } from "obsidian";
import type TerminalPlugin from "./main";

export const VIEW_TYPE_CLAUDE_FILES = "claude-files";

interface TreeNode {
	name: string;
	path: string;
	isFolder: boolean;
	children: TreeNode[];
}

export class ClaudeFilesView extends ItemView {
	plugin: TerminalPlugin;
	private containerEl_: HTMLElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: TerminalPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_CLAUDE_FILES;
	}

	getDisplayText(): string {
		return ".claude";
	}

	getIcon(): string {
		return "claude";
	}

	async onOpen(): Promise<void> {
		const container = this.contentEl;
		container.empty();
		container.addClass("claude-files-container");

		this.containerEl_ = container;

		await this.renderTree();

		// Auto-refresh when files change inside .claude
		const refresh = (file: TAbstractFile) => {
			if (file.path.startsWith(".claude")) {
				this.renderTree();
			}
		};

		this.registerEvent(this.app.vault.on("create", refresh));
		this.registerEvent(this.app.vault.on("delete", refresh));
		this.registerEvent(this.app.vault.on("rename", (file: TAbstractFile) => refresh(file)));
		this.registerEvent(this.app.vault.on("modify", refresh));
	}

	async renderTree(): Promise<void> {
		if (!this.containerEl_) return;
		this.containerEl_.empty();

		const adapter = this.app.vault.adapter;

		// Check if .claude folder exists
		const exists = await adapter.exists(".claude");
		if (!exists) {
			this.containerEl_.createEl("div", {
				text: "No .claude folder found in this vault.",
				cls: "claude-tree-empty",
			});
			return;
		}

		const tree = await this.buildTree(".claude");
		this.renderNode(this.containerEl_, tree, 0);
	}

	private async buildTree(folderPath: string): Promise<TreeNode> {
		const adapter = this.app.vault.adapter;
		const listing = await adapter.list(folderPath);
		const children: TreeNode[] = [];

		// Sort: folders first, then files, both alphabetical
		const sortedFolders = (listing.folders || []).slice().sort();
		const sortedFiles = (listing.files || []).slice().sort();

		for (const subfolder of sortedFolders) {
			const child = await this.buildTree(subfolder);
			children.push(child);
		}

		for (const file of sortedFiles) {
			const name = file.split("/").pop() || file;
			children.push({
				name,
				path: file,
				isFolder: false,
				children: [],
			});
		}

		const name = folderPath.split("/").pop() || folderPath;
		return {
			name,
			path: folderPath,
			isFolder: true,
			children,
		};
	}

	private renderNode(parentEl: HTMLElement, node: TreeNode, depth: number): void {
		if (node.isFolder) {
			const details = parentEl.createEl("details", { cls: "claude-tree-folder" });
			if (depth === 0) {
				details.setAttribute("open", "");
			}
			details.style.paddingLeft = depth > 0 ? "16px" : "0";

			const summary = details.createEl("summary", { cls: "claude-tree-folder-summary" });
			summary.createSpan({ cls: "claude-tree-folder-icon", text: "\u{1F4C1} " });
			summary.createSpan({ text: node.name });

			// Context menu on folder
			summary.addEventListener("contextmenu", (e: MouseEvent) => {
				e.preventDefault();
				const menu = new Menu();
				menu.addItem((item) => {
					item.setTitle("Reveal in system explorer")
						.setIcon("folder-open")
						.onClick(() => this.revealInExplorer(node.path));
				});
				menu.addItem((item) => {
					item.setTitle("Refresh")
						.setIcon("refresh-cw")
						.onClick(() => this.renderTree());
				});
				menu.showAtMouseEvent(e);
			});

			for (const child of node.children) {
				this.renderNode(details, child, depth + 1);
			}
		} else {
			const fileRow = parentEl.createDiv({ cls: "claude-tree-file" });
			fileRow.style.paddingLeft = `${depth * 16}px`;

			const icon = this.getFileIcon(node.name);
			fileRow.createSpan({ cls: "claude-tree-file-icon", text: icon + " " });
			fileRow.createSpan({ text: node.name, cls: "claude-tree-file-name" });

			// Click to open
			fileRow.addEventListener("click", () => this.openFile(node.path));

			// Context menu on file
			fileRow.addEventListener("contextmenu", (e: MouseEvent) => {
				e.preventDefault();
				const menu = new Menu();
				menu.addItem((item) => {
					item.setTitle("Open")
						.setIcon("file-text")
						.onClick(() => this.openFile(node.path));
				});
				menu.addItem((item) => {
					item.setTitle("Reveal in system explorer")
						.setIcon("folder-open")
						.onClick(() => this.revealInExplorer(node.path));
				});
				menu.addItem((item) => {
					item.setTitle("Refresh")
						.setIcon("refresh-cw")
						.onClick(() => this.renderTree());
				});
				menu.showAtMouseEvent(e);
			});
		}
	}

	private getFileIcon(name: string): string {
		if (name.endsWith(".md")) return "\u{1F4DD}";
		if (name.endsWith(".json")) return "\u{1F4CB}";
		if (name.endsWith(".yml") || name.endsWith(".yaml")) return "\u2699\uFE0F";
		if (name.endsWith(".gitignore") || name.startsWith(".")) return "\u{1F6E1}\uFE0F";
		return "\u{1F4C4}";
	}

	private async openFile(filePath: string): Promise<void> {
		const adapter = this.app.vault.adapter;

		try {
			const existsOnDisk = await adapter.exists(filePath);
			if (!existsOnDisk) {
				return;
			}

			// Check if the file is already indexed by Obsidian
			const abstractFile = this.app.vault.getAbstractFileByPath(filePath);
			if (abstractFile) {
				// Obsidian knows about this file — open via workspace
				const leaf = this.app.workspace.getLeaf("tab");
				await leaf.openFile(abstractFile as any);
				return;
			}

			// File exists on disk but not in the vault index (hidden by Obsidian).
			// Read it and open in a new text editing leaf.
			const content = await adapter.read(filePath);
			const leaf = this.app.workspace.getLeaf("tab");

			// Create a temporary in-memory view by writing it back as a vault file
			// so Obsidian can open it. Since .claude is a dotfolder, we open via
			// adapter read and display in a plain container.
			await leaf.setViewState({ type: "empty", active: true });
			this.app.workspace.revealLeaf(leaf);

			const viewContainer = (leaf.view as any).contentEl as HTMLElement;
			viewContainer.empty();
			viewContainer.addClass("claude-file-reader");

			const header = viewContainer.createDiv({ cls: "claude-file-reader-header" });
			header.createEl("span", { text: filePath, cls: "claude-file-reader-path" });

			const textarea = viewContainer.createEl("textarea", {
				cls: "claude-file-reader-content",
			});
			textarea.value = content;
			textarea.readOnly = false;
			textarea.spellcheck = false;

			// Save on Ctrl+S
			textarea.addEventListener("keydown", async (e: KeyboardEvent) => {
				if ((e.ctrlKey || e.metaKey) && e.key === "s") {
					e.preventDefault();
					await adapter.write(filePath, textarea.value);
				}
			});
		} catch (err) {
			console.error("Failed to open claude file:", err);
		}
	}

	private revealInExplorer(filePath: string): void {
		try {
			const path = require("path");
			const adapter = this.app.vault.adapter as any;
			const basePath = adapter.getBasePath?.() || process.cwd();
			const fullPath = path.join(basePath, filePath);
			const { shell } = require("electron");
			shell.showItemInFolder(fullPath);
		} catch (err) {
			console.error("Failed to reveal in explorer:", err);
		}
	}

	async onClose(): Promise<void> {
		this.containerEl_ = null;
	}
}
