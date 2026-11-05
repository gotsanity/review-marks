import { describe, expect, it } from 'vitest';
import { TriggerRecording } from './recording';

/** A key event: the key that moved plus the modifiers held once it moved. */
const ev = (key: string, held: string) => ({
	key,
	ctrlKey: held.includes('ctrl'),
	metaKey: held.includes('meta'),
	altKey: held.includes('alt'),
	shiftKey: held.includes('shift'),
});

describe('TriggerRecording', () => {
	it('saves Ctrl + Alt when both are pressed and released together', () => {
		const r = new TriggerRecording(false);
		r.keydown(ev('Control', 'ctrl'));
		r.keydown(ev('Alt', 'ctrl alt'));
		r.keyup(ev('Control', 'alt'));
		expect(r.keyup(ev('Alt', ''))).toEqual({ kind: 'done', trigger: 'mod-alt', label: 'Ctrl + Alt' });
	});

	it('shows the keys held so far, live', () => {
		const r = new TriggerRecording(false);
		expect(r.keydown(ev('Shift', 'shift'))).toEqual({ kind: 'recording', label: 'Shift' });
		expect(r.keydown(ev('Control', 'ctrl shift'))).toEqual({ kind: 'recording', label: 'Ctrl + Shift' });
	});

	it('keeps the largest combination held when keys are released one at a time', () => {
		const r = new TriggerRecording(false);
		r.keydown(ev('Control', 'ctrl'));
		r.keydown(ev('Alt', 'ctrl alt'));
		expect(r.keyup(ev('Alt', 'ctrl'))).toEqual({ kind: 'recording', label: 'Ctrl + Alt' });
		expect(r.keyup(ev('Control', ''))).toEqual({ kind: 'done', trigger: 'mod-alt', label: 'Ctrl + Alt' });
	});

	it('counts a key pressed again after another was released', () => {
		const r = new TriggerRecording(false);
		r.keydown(ev('Control', 'ctrl'));
		r.keydown(ev('Alt', 'ctrl alt'));
		r.keyup(ev('Alt', 'ctrl'));
		r.keydown(ev('Shift', 'ctrl shift'));
		r.keyup(ev('Shift', 'ctrl'));
		expect(r.keyup(ev('Control', ''))).toEqual({ kind: 'done', trigger: 'mod-alt-shift', label: 'Ctrl + Alt + Shift' });
	});

	it("counts a modifier's own keyup as released, even if the event still reports it held", () => {
		const r = new TriggerRecording(false);
		r.keydown(ev('Control', 'ctrl'));
		r.keydown(ev('Shift', 'ctrl shift'));
		expect(r.keyup(ev('Shift', 'ctrl shift'))).toEqual({ kind: 'recording', label: 'Ctrl + Shift' });
		expect(r.keyup(ev('Control', 'ctrl'))).toEqual({ kind: 'done', trigger: 'mod-shift', label: 'Ctrl + Shift' });
	});

	it('ignores a letter, names it, and keeps recording', () => {
		const r = new TriggerRecording(false);
		r.keydown(ev('Alt', 'alt'));
		expect(r.keydown(ev('a', 'alt'))).toEqual({ kind: 'recording', label: 'Alt', ignored: 'a' });
		expect(r.keyup(ev('a', 'alt'))).toEqual({ kind: 'recording', label: 'Alt' });
		expect(r.keyup(ev('Alt', ''))).toEqual({ kind: 'done', trigger: 'alt', label: 'Alt' });
	});

	it('does not finish when a letter pressed alone is released', () => {
		const r = new TriggerRecording(false);
		r.keydown(ev('a', ''));
		expect(r.keyup(ev('a', ''))).toEqual({ kind: 'recording', label: '' });
	});

	it('cancels on Esc, even with keys held', () => {
		const r = new TriggerRecording(false);
		r.keydown(ev('Control', 'ctrl'));
		expect(r.keydown(ev('Escape', 'ctrl'))).toEqual({ kind: 'cancelled' });
	});

	it("finishes with no trigger when the combination can't be stored", () => {
		const r = new TriggerRecording(false);
		r.keydown(ev('Control', 'ctrl'));
		r.keydown(ev('Meta', 'ctrl meta'));
		r.keyup(ev('Meta', 'ctrl'));
		expect(r.keyup(ev('Control', ''))).toEqual({ kind: 'done', trigger: null, label: 'Ctrl + Win' });
	});

	it('reads and prints the keys the macOS way', () => {
		const r = new TriggerRecording(true);
		expect(r.keydown(ev('Meta', 'meta'))).toEqual({ kind: 'recording', label: '⌘' });
		r.keydown(ev('Alt', 'meta alt'));
		r.keyup(ev('Meta', 'alt'));
		expect(r.keyup(ev('Alt', ''))).toEqual({ kind: 'done', trigger: 'mod-alt', label: '⌘ ⌥' });
	});

	it('stores Control on macOS as its own trigger', () => {
		const r = new TriggerRecording(true);
		r.keydown(ev('Control', 'ctrl'));
		expect(r.keyup(ev('Control', ''))).toEqual({ kind: 'done', trigger: 'ctrl', label: '⌃' });
	});
});
