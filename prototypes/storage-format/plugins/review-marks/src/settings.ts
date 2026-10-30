// PROTOTYPE (throwaway). Settings: interface, defaults, the live settings object and the tab.
import { App, Platform, Plugin, PluginSettingTab, Setting } from 'obsidian';
import type { Placement } from './parse';

export interface ReviewMarksSettings {
  placement: Placement;
  showBadge: boolean;
  excerptLength: number;
  showHover: boolean;
  hideReviewFootnotes: boolean;
  dragTrigger: DragTrigger;
}

/**
 * Modifiers held while drag-selecting to annotate. 'mod' is Ctrl, or Cmd on macOS. 'meta' (the Windows
 * key) is offered on Windows and Linux only; 'ctrl' (the real Control key) on macOS only.
 */
export type DragTrigger = 'off' | 'alt' | 'mod' | 'shift' | 'meta' | 'mod-alt' | 'mod-shift' | 'alt-shift' | 'mod-alt-shift'
  | 'ctrl' | 'ctrl-alt' | 'ctrl-shift' | 'ctrl-alt-shift';
const TRIGGERS_PC: Partial<Record<DragTrigger, string>> = {
  off: 'Off', alt: 'Alt', mod: 'Ctrl (Cmd on macOS)', shift: 'Shift', meta: 'Meta (Windows key, Cmd on macOS)',
  'mod-alt': 'Ctrl+Alt', 'mod-shift': 'Ctrl+Shift', 'alt-shift': 'Alt+Shift', 'mod-alt-shift': 'Ctrl+Alt+Shift',
};
const TRIGGERS_MAC: Partial<Record<DragTrigger, string>> = {
  off: 'Off', alt: 'Option', shift: 'Shift', mod: 'Cmd', ctrl: 'Control',
  'mod-alt': 'Cmd+Option', 'mod-shift': 'Cmd+Shift', 'ctrl-alt': 'Control+Option', 'ctrl-shift': 'Control+Shift',
  'alt-shift': 'Option+Shift', 'mod-alt-shift': 'Cmd+Option+Shift', 'ctrl-alt-shift': 'Control+Option+Shift',
};
export function dragTriggers() { return Platform.isMacOS ? TRIGGERS_MAC : TRIGGERS_PC; }

/**
 * The stored trigger as this platform reads it (settings sync between devices). On macOS, Meta is Cmd
 * ('mod'). Elsewhere, the macOS-only Control choices become Ctrl ('mod').
 */
export function effectiveTrigger(t: DragTrigger = settings.dragTrigger): DragTrigger {
  if (Platform.isMacOS) return t === 'meta' ? 'mod' : t;
  return t.startsWith('ctrl') ? (t.replace('ctrl', 'mod') as DragTrigger) : t;
}

export const DEFAULT_SETTINGS: ReviewMarksSettings = {
  placement: 'end-of-section',
  showBadge: true,
  excerptLength: 32,
  showHover: true,
  hideReviewFootnotes: true,
  dragTrigger: 'alt',
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
      .setDesc('Where the comment of a new annotation is written. Existing annotations are never moved; to convert a note, run "Move comments to end of note" or "Move comments to end of sections".')
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

    new Setting(containerEl)
      .setName('Annotate-on-drag trigger')
      .setDesc("Hold these keys while you drag-select text to annotate it at once. Works in Live Preview, Source mode and Reading view (which switches to Live Preview). The editor's own behaviour for this combination is turned off while the setting is on.")
      .addDropdown((d) => {
        for (const [k, label] of Object.entries(dragTriggers())) d.addOption(k, label!);
        d.setValue(effectiveTrigger())
          .onChange(async (v) => { settings.dragTrigger = v as DragTrigger; await saveSettings(this.plugin); });
      });
  }
}
