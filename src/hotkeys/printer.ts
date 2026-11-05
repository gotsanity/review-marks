// Obsidian's hotkey printer, copied as a pure function: Obsidian has no public one. The platform is
// an argument so both styles can be tested anywhere. Checked against 1.7.4 and 1.14.5.

/** A hotkey as Obsidian stores it. `code` (a `KeyboardEvent.code`) is optional and wins over `key`. */
export interface PrintableHotkey {
	modifiers: readonly string[];
	key: string;
	code?: string;
}

const ORDER = ['Mod', 'Ctrl', 'Meta', 'Alt', 'Shift'] as const;
const MAC: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Meta: '⌘', Alt: '⌥', Shift: '⇧' };
const PC: Record<string, string> = { Mod: 'Ctrl', Ctrl: 'Ctrl', Meta: 'Win', Alt: 'Alt', Shift: 'Shift' };
const KEYS: Record<string, string> = { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', ' ': 'Space' };

function modifierParts(modifiers: readonly string[], isMac: boolean): string[] {
	const names = isMac ? MAC : PC;
	return ORDER.filter((m) => modifiers.includes(m)).map((m) => names[m] as string);
}

function joinParts(parts: readonly string[], isMac: boolean): string {
	return parts.join(isMac ? ' ' : ' + ');
}

/**
 * Prints modifiers alone (Obsidian's `Mod`, `Ctrl`, `Meta`, `Alt`, `Shift`) in the same style as
 * `printHotkey`: "Ctrl + Alt" on Windows and Linux, "⌘ ⌥" on macOS.
 */
export function printModifiers(modifiers: readonly string[], isMac: boolean): string {
	return joinParts(modifierParts(modifiers, isMac), isMac);
}

function keyName(hotkey: PrintableHotkey): string {
	const key = hotkey.code ? hotkey.code.replace(/^Key(?=[A-Z]$)/, '') : hotkey.key;
	return KEYS[key] ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/** Prints a hotkey the way Obsidian's Hotkeys tab does. */
export function printHotkey(hotkey: PrintableHotkey, isMac: boolean): string {
	return joinParts([...modifierParts(hotkey.modifiers, isMac), keyName(hotkey)], isMac);
}
