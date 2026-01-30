import { App, PluginSettingTab, Setting } from "obsidian";
import type TerminalPlugin from "./main";

export interface TerminalPluginSettings {
	defaultShell: string;
	defaultShellArgs: string[];
	fontSize: number;
	fontFamily: string;
}

interface ShellPreset {
	label: string;
	executable: string;
	args: string[];
	platform: NodeJS.Platform[];
}

const SHELL_PRESETS: ShellPreset[] = [
	{ label: "PowerShell", executable: "powershell", args: [], platform: ["win32"] },
	{ label: "PowerShell 7 (pwsh)", executable: "pwsh", args: [], platform: ["win32", "linux", "darwin"] },
	{ label: "CMD", executable: "cmd", args: [], platform: ["win32"] },
	{ label: "Git Bash", executable: "C:\\Program Files\\Git\\bin\\bash.exe", args: ["--login"], platform: ["win32"] },
	{ label: "WSL", executable: "wsl", args: [], platform: ["win32"] },
	{ label: "Bash", executable: "bash", args: ["--login"], platform: ["linux", "darwin"] },
	{ label: "Zsh", executable: "zsh", args: ["--login"], platform: ["darwin", "linux"] },
];

export function getDefaultSettings(): TerminalPluginSettings {
	let defaultShell: string;
	let defaultArgs: string[] = [];

	switch (process.platform) {
		case "win32":
			defaultShell = "powershell";
			break;
		case "darwin":
			defaultShell = "/bin/zsh";
			defaultArgs = ["--login"];
			break;
		default:
			defaultShell = "/bin/bash";
			defaultArgs = ["--login"];
			break;
	}

	return {
		defaultShell: defaultShell,
		defaultShellArgs: defaultArgs,
		fontSize: 14,
		fontFamily: "monospace",
	};
}

export class TerminalSettingTab extends PluginSettingTab {
	plugin: TerminalPlugin;

	constructor(app: App, plugin: TerminalPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Shell selection
		const platformPresets = SHELL_PRESETS.filter(p => p.platform.includes(process.platform));

		new Setting(containerEl)
			.setName("Shell")
			.setDesc("The shell executable to launch.")
			.addDropdown(dropdown => {
				for (const preset of platformPresets) {
					dropdown.addOption(preset.executable, preset.label);
				}
				dropdown.addOption("custom", "Custom...");
				// Set current value
				const current = this.plugin.settings.defaultShell;
				const isPreset = platformPresets.some(p => p.executable === current);
				dropdown.setValue(isPreset ? current : "custom");
				dropdown.onChange(async (value) => {
					if (value === "custom") {
						// Show the custom input, don't change shell yet
						customShellSetting.settingEl.toggleClass("is-hidden", false);
					} else {
						customShellSetting.settingEl.toggleClass("is-hidden", true);
						this.plugin.settings.defaultShell = value;
						// Apply preset args
						const preset = platformPresets.find(p => p.executable === value);
						if (preset) {
							this.plugin.settings.defaultShellArgs = [...preset.args];
						}
						await this.plugin.saveSettings();
					}
				});
			});

		// Custom shell path (hidden unless "Custom" selected)
		const customShellSetting = new Setting(containerEl)
			.setName("Custom shell path")
			.setDesc("Full path to the shell executable.")
			.addText(text => {
				text.setPlaceholder("/usr/bin/fish")
					.setValue(
						platformPresets.some(p => p.executable === this.plugin.settings.defaultShell)
							? ""
							: this.plugin.settings.defaultShell
					)
					.onChange(async (value) => {
						this.plugin.settings.defaultShell = value;
						await this.plugin.saveSettings();
					});
			});

		// Hide custom input by default if a preset is selected
		const isCustom = !platformPresets.some(p => p.executable === this.plugin.settings.defaultShell);
		customShellSetting.settingEl.toggleClass("is-hidden", !isCustom);

		// Shell arguments
		new Setting(containerEl)
			.setName("Shell arguments")
			.setDesc("Arguments passed to the shell (space-separated).")
			.addText(text => {
				text.setPlaceholder("--login")
					.setValue(this.plugin.settings.defaultShellArgs.join(" "))
					.onChange(async (value) => {
						this.plugin.settings.defaultShellArgs = value.trim() ? value.trim().split(/\s+/) : [];
						await this.plugin.saveSettings();
					});
			});

		// Font size
		new Setting(containerEl)
			.setName("Font size")
			.setDesc("Terminal font size in pixels.")
			.addSlider(slider => {
				slider.setLimits(8, 24, 1)
					.setValue(this.plugin.settings.fontSize)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.fontSize = value;
						await this.plugin.saveSettings();
					});
			});

		// Font family
		new Setting(containerEl)
			.setName("Font family")
			.setDesc("Terminal font family (CSS value).")
			.addText(text => {
				text.setPlaceholder("monospace")
					.setValue(this.plugin.settings.fontFamily)
					.onChange(async (value) => {
						this.plugin.settings.fontFamily = value || "monospace";
						await this.plugin.saveSettings();
					});
			});
	}
}
