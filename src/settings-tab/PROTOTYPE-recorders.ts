// PROTOTYPE, throwaway (wayfinder "Prototype: Key recorder for command hotkeys and the drag trigger").
// Not production code: no tests, no guards beyond what keeps it running. Branch prototype/key-recorder only.
//
// Plan: variants of the two recorders, mounted in the real settings tab and switched from a
// PROTOTYPE bar at the top of the tab.
//   Hotkeys section   A: Obsidian-style chips (several hotkeys per command, "+" to record, × on each chip)
//                     B: compact table, one hotkey per command, the field itself is the record button
//                     C: the fallback when the private API is missing: read-only, opens Obsidian's Hotkeys tab
//   Drag trigger      1: recorder, commits when every key is released (the largest combination held counts)
//                     2: recorder, commits on the first key released
//                     3: no recorder: four modifier toggle buttons
//   Conflicts         warn (save, mark red) / refuse (don't save) / replace (ask, then take it from the other command)
// Hotkeys really are written through app.hotkeyManager (this vault's .obsidian/hotkeys.json), and
// the drag trigger through the real settings store, so both can be tried for real.
import { Modal, Notice, Platform, Scope, Setting, setIcon, type App, type Hotkey, type Modifier } from 'obsidian';
import type ReviewMarksPlugin from '../main';
import { isDragTrigger, type DragTrigger } from '../drag/trigger';

type HotkeysVariant = 'A' | 'B' | 'C';
type DragVariant = '1' | '2' | '3';
type ConflictMode = 'warn' | 'refuse' | 'replace';

const state = {
	hotkeys: 'A' as HotkeysVariant,
	drag: '1' as DragVariant,
	conflicts: 'warn' as ConflictMode,
	last: '-',
};

const HOTKEYS_LABELS: Record<HotkeysVariant, string> = {
	A: 'A: chips like Obsidian’s Hotkeys tab',
	B: 'B: compact table, one hotkey each',
	C: 'C: fallback (private API missing)',
};
const DRAG_LABELS: Record<DragVariant, string> = {
	'1': '1: records, commits when all keys are released',
	'2': '2: records, commits on the first key released',
	'3': '3: modifier toggle buttons, no recording',
};

// ---- private API, cast locally -------------------------------------------------------------

interface HotkeyManager {
	getHotkeys(id: string): Hotkey[] | undefined;
	getDefaultHotkeys(id: string): Hotkey[] | undefined;
	setHotkeys(id: string, hotkeys: Hotkey[]): void;
	removeHotkeys(id: string): void;
	save(): Promise<void>;
}
interface Command {
	id: string;
	name: string;
}
const hm = (app: App) => (app as unknown as { hotkeyManager: HotkeyManager }).hotkeyManager;
const allCommands = (app: App) => Object.values((app as unknown as { commands: { commands: Record<string, Command> } }).commands.commands);
const effective = (app: App, id: string): Hotkey[] => hm(app).getHotkeys(id) ?? hm(app).getDefaultHotkeys(id) ?? [];

function openHotkeysTab(app: App): void {
	const setting = (app as unknown as { setting: { open(): void; openTabById(id: string): { setQuery?(q: string): void } | null } }).setting;
	setting.open();
	setting.openTabById('hotkeys')?.setQuery?.('Review Marks');
}

// ---- printing (port of Obsidian's printer) ---------------------------------------------------

const MAC: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Meta: '⌘', Alt: '⌥', Shift: '⇧' };
const PC: Record<string, string> = { Mod: 'Ctrl', Ctrl: 'Ctrl', Meta: 'Win', Alt: 'Alt', Shift: 'Shift' };
const ORDER = ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift'];
const KEYS: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ' ': 'Space' };

function printParts(modifiers: string[], key: string | null): string {
	const names = Platform.isMacOS ? MAC : PC;
	const parts = ORDER.filter((m) => modifiers.includes(m)).map((m) => names[m]);
	if (key) parts.push(KEYS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()));
	return parts.join(Platform.isMacOS ? ' ' : ' + ');
}
const print = (h: Hotkey) => printParts(h.modifiers, h.key);

/** Other commands whose hotkeys print the same. */
function conflictsOf(app: App, id: string, h: Hotkey): Command[] {
	const text = print(h);
	return allCommands(app).filter((c) => c.id !== id && effective(app, c.id).some((o) => print(o) === text));
}

const shortName = (c: Command) => c.name.replace(/^Review Marks: /, '');
const ourCommands = (app: App) => allCommands(app).filter((c) => c.id.startsWith('review-marks:')).sort((a, b) => a.name.localeCompare(b.name));

function log(msg: string): void {
	state.last = msg;
	console.log('[key recorder prototype]', msg);
}

// ---- recording a command hotkey ---------------------------------------------------------------

let stopRecording: (() => void) | null = null;

/** Records one hotkey with a pushed Scope, the way Obsidian's Hotkeys tab does. */
function recordHotkey(app: App, onDone: (h: Hotkey | null) => void): void {
	stopRecording?.();
	const scope = new Scope();
	const stop = () => {
		app.keymap.popScope(scope);
		stopRecording = null;
	};
	stopRecording = () => {
		stop();
		onDone(null);
	};
	scope.register(null, null, (evt, ctx) => {
		const key = ctx.vkey;
		if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return false;
		if (key === 'Escape' && !ctx.modifiers) {
			stop();
			log('hotkey recording cancelled (Esc)');
			onDone(null);
			return false;
		}
		const modifiers = (ctx.modifiers ? ctx.modifiers.split(',') : []).map((m) =>
			Platform.isMacOS ? (m === 'Meta' ? 'Mod' : m) : m === 'Ctrl' ? 'Mod' : m,
		) as Modifier[];
		const h: Hotkey = { modifiers, key };
		if (modifiers.length === 0 && !/^F\d+$/.test(key)) {
			new Notice(`${printParts([], key)} needs a modifier key. Still recording; Esc cancels.`);
			log(`rejected ${print(h)}: no modifier`);
			return false;
		}
		if (modifiers.length === 1 && modifiers[0] === 'Shift' && key.length === 1) {
			new Notice(`${print(h)} types a character. Still recording; Esc cancels.`);
			log(`rejected ${print(h)}: Shift + one character`);
			return false;
		}
		evt.preventDefault();
		stop();
		onDone(h);
		return false;
	});
	app.keymap.pushScope(scope);
	log('recording a hotkey: press the keys (Esc cancels)');
}

class ConfirmModal extends Modal {
	constructor(app: App, private readonly text: string, private readonly onYes: () => void) {
		super(app);
	}
	onOpen(): void {
		this.contentEl.createEl('p', { text: this.text });
		new Setting(this.contentEl)
			.addButton((b) => b.setButtonText('Cancel').onClick(() => this.close()))
			.addButton((b) =>
				b
					.setButtonText('Reassign')
					.setWarning()
					.onClick(() => {
						this.close();
						this.onYes();
					}),
			);
	}
}

/** Adds `h` to the command (or replaces its hotkeys when `single`), applying the conflict mode. */
async function assign(plugin: ReviewMarksPlugin, cmd: Command, h: Hotkey, single: boolean): Promise<void> {
	const app = plugin.app;
	const current = effective(app, cmd.id);
	if (!single && current.some((o) => print(o) === print(h))) {
		log(`${print(h)} already on ${shortName(cmd)}: skipped`);
		return;
	}
	const save = async () => {
		hm(app).setHotkeys(cmd.id, single ? [h] : [...current, h]);
		await hm(app).save();
		log(`set ${print(h)} on ${shortName(cmd)}`);
		plugin.settingsTab.display();
	};
	const others = conflictsOf(app, cmd.id, h);
	if (others.length === 0 || state.conflicts === 'warn') {
		if (others.length) log(`set ${print(h)} on ${shortName(cmd)}, conflicts with ${others.map((o) => o.name).join(', ')} (warned)`);
		return save();
	}
	const names = others.map((o) => `“${o.name}”`).join(', ');
	if (state.conflicts === 'refuse') {
		new Notice(`Review Marks: ${print(h)} is already used by ${names}. Nothing was changed.`);
		log(`refused ${print(h)} for ${shortName(cmd)}: used by ${names}`);
		plugin.settingsTab.display();
		return;
	}
	new ConfirmModal(app, `${print(h)} is already used by ${names}. Remove it there and use it for “${cmd.name}”?`, () => {
		void (async () => {
			for (const o of others) hm(app).setHotkeys(o.id, effective(app, o.id).filter((x) => print(x) !== print(h)));
			log(`reassigned ${print(h)} from ${names} to ${shortName(cmd)}`);
			await save();
		})();
	}).open();
}

async function clear(plugin: ReviewMarksPlugin, cmd: Command, h?: Hotkey): Promise<void> {
	const app = plugin.app;
	const rest = h ? effective(app, cmd.id).filter((o) => print(o) !== print(h)) : [];
	if (rest.length) hm(app).setHotkeys(cmd.id, rest);
	else hm(app).removeHotkeys(cmd.id);
	await hm(app).save();
	log(`cleared ${h ? print(h) : 'all hotkeys'} on ${shortName(cmd)}`);
	plugin.settingsTab.display();
}

function conflictTitle(app: App, cmd: Command, h: Hotkey): string | null {
	const others = conflictsOf(app, cmd.id, h);
	return others.length ? `Also used by ${others.map((o) => o.name).join(', ')}` : null;
}

// ---- Hotkeys section variants -------------------------------------------------------------------

function hotkeysA(el: HTMLElement, plugin: ReviewMarksPlugin): void {
	const app = plugin.app;
	for (const cmd of ourCommands(app)) {
		const setting = new Setting(el).setName(shortName(cmd));
		const box = setting.controlEl.createDiv({ cls: 'setting-command-hotkeys' });
		const hotkeys = effective(app, cmd.id);
		for (const h of hotkeys) {
			const chip = box.createSpan({ cls: 'setting-hotkey', text: print(h) });
			const conflict = conflictTitle(app, cmd, h);
			if (conflict) {
				chip.addClass('has-conflict');
				chip.setAttr('style', 'color:var(--text-error)');
				chip.setAttr('aria-label', conflict);
			}
			const x = chip.createSpan({ cls: 'setting-hotkey-icon setting-delete-hotkey', attr: { 'aria-label': 'Delete hotkey' } });
			setIcon(x, 'x');
			x.addEventListener('click', () => void clear(plugin, cmd, h));
		}
		if (hotkeys.length === 0) box.createSpan({ cls: 'setting-hotkey mod-empty', text: 'Blank' });
		const add = setting.controlEl.createSpan({ cls: 'clickable-icon setting-add-hotkey-button', attr: { 'aria-label': 'Customize this command' } });
		setIcon(add, 'plus-circle');
		add.addEventListener('click', () => {
			box.createSpan({ cls: 'setting-hotkey mod-active', text: 'Press hotkey...' });
			recordHotkey(app, (h) => (h ? void assign(plugin, cmd, h, false) : plugin.settingsTab.display()));
		});
	}
}

function hotkeysB(el: HTMLElement, plugin: ReviewMarksPlugin): void {
	const app = plugin.app;
	const table = el.createEl('table');
	table.setAttr('style', 'width:100%;border-collapse:collapse;font-size:var(--font-ui-small)');
	for (const cmd of ourCommands(app)) {
		const row = table.createEl('tr');
		row.setAttr('style', 'border-bottom:1px solid var(--background-modifier-border)');
		row.createEl('td', { text: shortName(cmd) }).setAttr('style', 'padding:6px 0');
		const cell = row.createEl('td');
		cell.setAttr('style', 'width:220px;text-align:right;padding:6px 0;white-space:nowrap');
		const h = effective(app, cmd.id)[0];
		const field = cell.createEl('button', { text: h ? print(h) : 'Click to set' });
		field.setAttr('style', `min-width:150px;font-family:var(--font-monospace);${h ? '' : 'color:var(--text-faint)'}`);
		const conflict = h && conflictTitle(app, cmd, h);
		if (conflict) field.setAttr('style', 'min-width:150px;font-family:var(--font-monospace);color:var(--text-error)');
		if (h && effective(app, cmd.id).length > 1) cell.createSpan({ text: ` +${effective(app, cmd.id).length - 1}`, attr: { 'aria-label': 'More hotkeys, set in Obsidian’s Hotkeys tab' } });
		field.addEventListener('click', () => {
			field.setText('Press keys… (Esc)');
			field.addClass('mod-cta');
			recordHotkey(app, (nh) => (nh ? void assign(plugin, cmd, nh, true) : plugin.settingsTab.display()));
		});
		const x = cell.createSpan({ cls: 'clickable-icon', attr: { 'aria-label': 'Clear' } });
		setIcon(x, 'x');
		if (!h) x.setAttr('style', 'visibility:hidden');
		x.addEventListener('click', () => void clear(plugin, cmd));
		if (conflict) {
			const warn = table.createEl('tr').createEl('td', { text: `⚠ ${conflict}`, attr: { colspan: '2' } });
			warn.setAttr('style', 'color:var(--text-error);font-size:var(--font-ui-smaller);padding:0 0 6px');
		}
	}
}

function hotkeysC(el: HTMLElement, plugin: ReviewMarksPlugin): void {
	const app = plugin.app;
	new Setting(el)
		.setDesc('Hotkeys for Review Marks commands are set in Obsidian’s Hotkeys settings.')
		.addButton((b) => b.setButtonText('Open Hotkeys settings').setCta().onClick(() => openHotkeysTab(app)));
	for (const cmd of ourCommands(app)) {
		const hotkeys = effective(app, cmd.id);
		const s = new Setting(el).setName(shortName(cmd));
		s.controlEl.createSpan({ cls: 'setting-hotkey' + (hotkeys.length ? '' : ' mod-empty'), text: hotkeys.length ? hotkeys.map(print).join(', ') : 'Blank' });
		s.addExtraButton((b) => b.setIcon('settings').setTooltip('Change in Hotkeys settings').onClick(() => openHotkeysTab(app)));
	}
}

// ---- drag trigger variants ----------------------------------------------------------------------

type Mod = 'ctrl' | 'meta' | 'alt' | 'shift';
const held = (e: KeyboardEvent): Set<Mod> => {
	const s = new Set<Mod>();
	if (e.ctrlKey) s.add('ctrl');
	if (e.metaKey) s.add('meta');
	if (e.altKey) s.add('alt');
	if (e.shiftKey) s.add('shift');
	return s;
};
const toObsidian = (m: Mod) => ({ ctrl: Platform.isMacOS ? 'Ctrl' : 'Mod', meta: Platform.isMacOS ? 'Mod' : 'Meta', alt: 'Alt', shift: 'Shift' })[m];
const printMods = (s: Set<Mod>) => printParts([...s].map(toObsidian), null);

/** Physical modifiers -> stored DragTrigger, or null when today's values can't store it. */
function toTrigger(s: Set<Mod>): DragTrigger | null {
	if (s.size === 0) return 'off';
	const mod = Platform.isMacOS ? s.has('meta') : s.has('ctrl');
	const ctrl = Platform.isMacOS && s.has('ctrl');
	const meta = !Platform.isMacOS && s.has('meta');
	const parts = [mod && 'mod', ctrl && 'ctrl', meta && 'meta', s.has('alt') && 'alt', s.has('shift') && 'shift'].filter(Boolean);
	const v = parts.join('-');
	return isDragTrigger(v) ? v : null;
}

function fromTrigger(t: DragTrigger): Set<Mod> {
	const s = new Set<Mod>();
	if (t === 'off') return s;
	for (const p of t.split('-')) {
		if (p === 'mod') s.add(Platform.isMacOS ? 'meta' : 'ctrl');
		else if (p === 'ctrl') s.add(Platform.isMacOS ? 'ctrl' : 'ctrl');
		else s.add(p as Mod);
	}
	return s;
}

async function saveTrigger(plugin: ReviewMarksPlugin, s: Set<Mod>): Promise<void> {
	const t = toTrigger(s);
	if (t === null) {
		new Notice(`Review Marks: ${printMods(s)} can't be the annotate-on-drag trigger.`);
		log(`drag trigger ${printMods(s)} rejected: no stored value for it`);
	} else {
		await plugin.store.update({ dragTrigger: t });
		log(`drag trigger set to ${t === 'off' ? 'Off' : printMods(s)} (stored '${t}')`);
	}
	plugin.settingsTab.display();
}

function recordModifiers(field: HTMLElement, plugin: ReviewMarksPlugin, commitOnFirstUp: boolean): void {
	stopRecording?.();
	const doc = field.doc;
	const app = plugin.app;
	// A scope that swallows everything, so Esc doesn't close Settings and no command runs.
	const scope = new Scope();
	scope.register(null, null, () => false);
	app.keymap.pushScope(scope);
	let peak = new Set<Mod>();
	const show = (s: Set<Mod>, hint = '') => field.setText(s.size ? `${printMods(s)}…${hint}` : `Hold the keys… (Esc cancels)${hint}`);
	const end = () => {
		doc.removeEventListener('keydown', onDown, true);
		doc.removeEventListener('keyup', onUp, true);
		app.keymap.popScope(scope);
		stopRecording = null;
	};
	const commit = (s: Set<Mod>) => {
		end();
		void saveTrigger(plugin, s);
	};
	const onDown = (e: KeyboardEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (e.key === 'Escape') {
			end();
			log('drag trigger recording cancelled (Esc)');
			plugin.settingsTab.display();
			return;
		}
		if (!['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(e.key)) {
			show(held(e), ` (only modifier keys: “${e.key}” ignored)`);
			log(`drag trigger: non-modifier ${e.key} ignored`);
			return;
		}
		const now = held(e);
		for (const m of now) peak.add(m);
		show(commitOnFirstUp ? now : peak);
	};
	const onUp = (e: KeyboardEvent) => {
		e.preventDefault();
		e.stopPropagation();
		if (!['Control', 'Shift', 'Alt', 'Meta', 'OS'].includes(e.key)) return;
		const now = held(e);
		if (commitOnFirstUp) {
			// The set held just before this key went up.
			const before = new Set(now);
			before.add(({ Control: 'ctrl', Meta: 'meta', OS: 'meta', Alt: 'alt', Shift: 'shift' } as const)[e.key as 'Control']);
			commit(before);
		} else if (now.size === 0 && peak.size) commit(peak);
		else show(peak);
	};
	doc.addEventListener('keydown', onDown, true);
	doc.addEventListener('keyup', onUp, true);
	stopRecording = () => {
		end();
		peak = new Set();
	};
	show(peak);
	field.addClass('mod-cta');
	log(`recording the drag trigger (${commitOnFirstUp ? 'commits on first release' : 'commits when all released'})`);
}

function dragSection(el: HTMLElement, plugin: ReviewMarksPlugin): void {
	const current = fromTrigger(plugin.store.current.dragTrigger);
	const s = new Setting(el)
		.setName('Annotate-on-drag trigger')
		.setDesc("Hold these keys while you drag-select text to annotate it at once. The editor's own behaviour for this combination is turned off while the setting is on.");
	if (state.drag === '3') {
		const keys: Mod[] = Platform.isMacOS ? ['meta', 'ctrl', 'alt', 'shift'] : ['ctrl', 'meta', 'alt', 'shift'];
		for (const m of keys) {
			const b = s.controlEl.createEl('button', { text: printMods(new Set([m])) });
			if (current.has(m)) b.addClass('mod-cta');
			const next = new Set(current);
			if (current.has(m)) next.delete(m);
			else next.add(m);
			if (toTrigger(next) === null) {
				b.disabled = true;
				b.setAttr('aria-label', `${printMods(next)} can't be the trigger`);
			}
			b.addEventListener('click', () => void saveTrigger(plugin, next));
		}
		if (current.size === 0) s.controlEl.createSpan({ text: 'Off', attr: { style: 'color:var(--text-faint);margin-left:6px' } });
		return;
	}
	const field = s.controlEl.createEl('button', { text: current.size ? printMods(current) : 'Off' });
	field.setAttr('style', `min-width:150px;font-family:var(--font-monospace);${current.size ? '' : 'color:var(--text-faint)'}`);
	field.addEventListener('click', () => recordModifiers(field, plugin, state.drag === '2'));
	s.addExtraButton((b) =>
		b
			.setIcon('x')
			.setTooltip('Turn off')
			.setDisabled(current.size === 0)
			.onClick(() => void saveTrigger(plugin, new Set())),
	);
}

// ---- PROTOTYPE bar and wiring -------------------------------------------------------------------

function bar(el: HTMLElement, plugin: ReviewMarksPlugin): void {
	const box = el.createDiv();
	box.setAttr('style', 'border:2px dashed var(--color-orange);border-radius:8px;padding:8px 10px;margin-bottom:12px;font-size:var(--font-ui-smaller);display:flex;flex-direction:column;gap:6px');
	box.createEl('b', { text: 'PROTOTYPE: key recorders' });
	const row = <T extends string>(label: string, values: T[], current: T, title: (v: T) => string, set: (v: T) => void) => {
		const r = box.createDiv();
		r.setAttr('style', 'display:flex;gap:4px;align-items:center;flex-wrap:wrap');
		r.createSpan({ text: label, attr: { style: 'min-width:90px' } });
		for (const v of values) {
			const b = r.createEl('button', { text: v, attr: { 'aria-label': title(v) } });
			if (v === current) b.addClass('mod-cta');
			b.addEventListener('click', () => {
				set(v);
				log(`${label} -> ${title(v)}`);
				plugin.settingsTab.display();
			});
		}
		r.createSpan({ text: title(current), attr: { style: 'color:var(--text-muted)' } });
	};
	row<HotkeysVariant>('Hotkeys:', ['A', 'B', 'C'], state.hotkeys, (v) => HOTKEYS_LABELS[v], (v) => (state.hotkeys = v));
	row<DragVariant>('Drag trigger:', ['1', '2', '3'], state.drag, (v) => DRAG_LABELS[v], (v) => (state.drag = v));
	row<ConflictMode>('Conflicts:', ['warn', 'refuse', 'replace'], state.conflicts, (v) => ({ warn: 'save it and mark it red', refuse: 'don’t save, show a notice', replace: 'ask, then take it from the other command' })[v], (v) => (state.conflicts = v));
	const app = plugin.app;
	const stored = ourCommands(app)
		.map((c) => [shortName(c), hm(app).getHotkeys(c.id)] as const)
		.filter(([, h]) => h)
		.map(([n, h]) => `${n}: ${JSON.stringify(h)}`);
	box.createDiv({ text: `stored dragTrigger: '${plugin.store.current.dragTrigger}' · custom hotkeys: ${stored.length ? stored.join(' · ') : 'none'}` }).setAttr('style', 'color:var(--text-faint);word-break:break-word');
	box.createDiv({ text: `last: ${state.last}` }).setAttr('style', 'color:var(--text-faint);word-break:break-word');
}

/** Mounts the prototype: the bar on top, the drag trigger where the dropdown was, Hotkeys last. */
export function registerRecordersPrototype(plugin: ReviewMarksPlugin, dragOrder: number): void {
	const tab = plugin.settingsTab;
	const display = tab.display.bind(tab);
	tab.display = () => {
		stopRecording?.();
		display();
	};
	const hide = tab.hide.bind(tab);
	tab.hide = () => {
		stopRecording?.();
		hide();
	};
	tab.addSection(0, (el) => bar(el, plugin));
	tab.addSection(dragOrder, (el) => dragSection(el, plugin));
	tab.addSection(1000, (el) => {
		new Setting(el).setName('Hotkeys').setHeading();
		if (state.hotkeys === 'A') hotkeysA(el, plugin);
		else if (state.hotkeys === 'B') hotkeysB(el, plugin);
		else hotkeysC(el, plugin);
	});
}
