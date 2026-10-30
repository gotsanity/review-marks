// PROTOTYPE (throwaway). Settings: interface, defaults, the live settings object and the tab.
import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { Placement } from './parse';

export interface ReviewMarksSettings {
  placement: Placement;
  showBadge: boolean;
  excerptLength: number;
  showHover: boolean;
  hideReviewFootnotes: boolean;
}

export const DEFAULT_SETTINGS: ReviewMarksSettings = {
  placement: 'end-of-section',
  showBadge: true,
  excerptLength: 32,
  showHover: true,
  hideReviewFootnotes: true,
};

/** The live settings. Every module reads this object; main.ts loads into it. */
export const settings: ReviewMarksSettings = { ...DEFAULT_SETTINGS };

/** Bumped on every change, so renderers can tell their cached DOM is stale. */
export let settingsVersion = 0;

const listeners: (() => void)[] = [];
export function onSettingsChange(cb: () => void) { listeners.push(cb); }

export async function loadSettings(plugin: Plugin) {
  Object.assign(settings, DEFAULT_SETTINGS, await plugin.loadData());
}

export async function saveSettings(plugin: Plugin) {
  await plugin.saveData(settings);
  settingsVersion++;
  for (const cb of listeners) cb();
}

export class ReviewMarksSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: Plugin) { super(app, plugin); }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('p', { text: 'PROTOTYPE. Throwaway code for trying the B+ storage format.', cls: 'setting-item-description' });

    new Setting(containerEl)
      .setName('Comment placement')
      .setDesc('Where the comment of a new annotation is written. Existing annotations are never moved.')
      .addDropdown((d) => d
        .addOption('end-of-section', 'End of section')
        .addOption('end-of-note', 'End of note')
        .setValue(settings.placement)
        .onChange(async (v) => { settings.placement = v as Placement; await saveSettings(this.plugin); }));

    new Setting(containerEl)
      .setName('Show comment badge')
      .setDesc('A pill after each annotation with the start of its comment.')
      .addToggle((t) => t.setValue(settings.showBadge)
        .onChange(async (v) => { settings.showBadge = v; await saveSettings(this.plugin); }));

    new Setting(containerEl)
      .setName('Badge excerpt length')
      .setDesc('How many characters of the comment the badge shows.')
      .addText((t) => t.setValue(String(settings.excerptLength))
        .onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!(n > 0)) return;
          settings.excerptLength = n;
          await saveSettings(this.plugin);
        }));

    new Setting(containerEl)
      .setName('Show comment on hover')
      .setDesc('Hovering an annotation shows its full comment. On mobile, tap the annotation instead.')
      .addToggle((t) => t.setValue(settings.showHover)
        .onChange(async (v) => { settings.showHover = v; await saveSettings(this.plugin); }));

    new Setting(containerEl)
      .setName('Hide review footnotes in the footnote list')
      .setDesc('In Reading view, the footnote list at the end of the note leaves out [^r…] comments. Your other footnotes stay.')
      .addToggle((t) => t.setValue(settings.hideReviewFootnotes)
        .onChange(async (v) => { settings.hideReviewFootnotes = v; await saveSettings(this.plugin); }));
  }
}
