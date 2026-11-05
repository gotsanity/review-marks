import { describe, expect, it } from 'vitest';
import { printHotkey, printModifiers } from './printer';

describe('printHotkey on Windows and Linux', () => {
	it('joins the parts with " + " and names Mod as Ctrl', () => {
		expect(printHotkey({ modifiers: ['Mod', 'Shift'], key: 'A' }, false)).toBe('Ctrl + Shift + A');
	});

	it('prints the modifiers in the order Mod, Ctrl, Meta, Alt, Shift whatever order they are stored in', () => {
		expect(printHotkey({ modifiers: ['Shift', 'Alt', 'Meta', 'Mod'], key: 'K' }, false)).toBe('Ctrl + Win + Alt + Shift + K');
		expect(printHotkey({ modifiers: ['Shift', 'Ctrl'], key: 'K' }, false)).toBe('Ctrl + Shift + K');
	});
});

describe('printHotkey on macOS', () => {
	it('prints symbols separated by spaces', () => {
		expect(printHotkey({ modifiers: ['Mod', 'Shift'], key: 'A' }, true)).toBe('⌘ ⇧ A');
	});

	it('prints the modifiers in the order Mod, Ctrl, Meta, Alt, Shift', () => {
		expect(printHotkey({ modifiers: ['Shift', 'Alt', 'Ctrl', 'Mod'], key: 'K' }, true)).toBe('⌘ ⌃ ⌥ ⇧ K');
		expect(printHotkey({ modifiers: ['Alt', 'Meta'], key: 'K' }, true)).toBe('⌘ ⌥ K');
	});
});

describe('printHotkey key names', () => {
	it('prints arrows as arrows and the space bar as Space', () => {
		expect(printHotkey({ modifiers: ['Mod'], key: 'ArrowUp' }, false)).toBe('Ctrl + ↑');
		expect(printHotkey({ modifiers: ['Alt'], key: 'ArrowLeft' }, true)).toBe('⌥ ←');
		expect(printHotkey({ modifiers: ['Mod'], key: ' ' }, false)).toBe('Ctrl + Space');
	});

	it('splits camel-case key names into words and capitalises single letters', () => {
		expect(printHotkey({ modifiers: ['Mod'], key: 'PageUp' }, false)).toBe('Ctrl + Page Up');
		expect(printHotkey({ modifiers: ['Mod'], key: 'a' }, false)).toBe('Ctrl + A');
		expect(printHotkey({ modifiers: [], key: 'F5' }, false)).toBe('F5');
	});

	it('prefers the physical key code when there is one, shortening KeyX to X', () => {
		expect(printHotkey({ modifiers: ['Mod'], key: 'q', code: 'KeyA' }, false)).toBe('Ctrl + A');
	});
});

describe('printModifiers', () => {
	it('prints modifiers alone in the same style, for the drag trigger', () => {
		expect(printModifiers(['Alt', 'Mod'], false)).toBe('Ctrl + Alt');
		expect(printModifiers(['Alt', 'Mod'], true)).toBe('⌘ ⌥');
		expect(printModifiers([], false)).toBe('');
	});
});
