import { describe, expect, it } from 'vitest';
import { dragTriggerOptions, effectiveTrigger, isDragTrigger, triggerHeld } from './trigger';

const keys = (held: string) => ({
	ctrlKey: held.includes('ctrl'),
	metaKey: held.includes('meta'),
	altKey: held.includes('alt'),
	shiftKey: held.includes('shift'),
});

describe('triggerHeld on Windows and Linux', () => {
	it('matches Alt alone, the default', () => {
		expect(triggerHeld(keys('alt'), 'alt', false)).toBe(true);
	});

	it('needs exactly the trigger keys: extra or missing keys do not match', () => {
		expect(triggerHeld(keys('alt shift'), 'alt', false)).toBe(false);
		expect(triggerHeld(keys(''), 'alt', false)).toBe(false);
		expect(triggerHeld(keys('ctrl'), 'alt', false)).toBe(false);
	});

	it('reads Ctrl as the Ctrl key and Meta as the Windows key', () => {
		expect(triggerHeld(keys('ctrl'), 'mod', false)).toBe(true);
		expect(triggerHeld(keys('meta'), 'mod', false)).toBe(false);
		expect(triggerHeld(keys('meta'), 'meta', false)).toBe(true);
	});

	it('matches combinations', () => {
		expect(triggerHeld(keys('ctrl alt shift'), 'mod-alt-shift', false)).toBe(true);
		expect(triggerHeld(keys('ctrl alt'), 'mod-alt-shift', false)).toBe(false);
		expect(triggerHeld(keys('alt shift'), 'alt-shift', false)).toBe(true);
	});

	it('never matches when the trigger is Off', () => {
		for (const held of ['', 'alt', 'ctrl', 'shift', 'meta', 'ctrl alt shift']) {
			expect(triggerHeld(keys(held), 'off', false)).toBe(false);
		}
	});
});

describe('triggerHeld on macOS', () => {
	it('reads Cmd as the Command key and Control as the Control key', () => {
		expect(triggerHeld(keys('meta'), 'mod', true)).toBe(true);
		expect(triggerHeld(keys('ctrl'), 'mod', true)).toBe(false);
		expect(triggerHeld(keys('ctrl'), 'ctrl', true)).toBe(true);
		expect(triggerHeld(keys('ctrl alt'), 'ctrl-alt', true)).toBe(true);
	});
});

describe('effectiveTrigger: a value stored on another platform', () => {
	it('maps the Windows key to Cmd on macOS', () => {
		expect(effectiveTrigger('meta', true)).toBe('mod');
	});

	it('maps the macOS Control choices to Ctrl elsewhere', () => {
		expect(effectiveTrigger('ctrl', false)).toBe('mod');
		expect(effectiveTrigger('ctrl-alt-shift', false)).toBe('mod-alt-shift');
	});

	it('leaves values the platform offers alone', () => {
		expect(effectiveTrigger('alt', true)).toBe('alt');
		expect(effectiveTrigger('mod-shift', false)).toBe('mod-shift');
		expect(effectiveTrigger('ctrl-shift', true)).toBe('ctrl-shift');
	});

	it('is what triggerHeld goes by', () => {
		expect(triggerHeld(keys('ctrl'), 'ctrl', false)).toBe(true);
		expect(triggerHeld(keys('meta'), 'meta', true)).toBe(true);
	});
});

describe('dragTriggerOptions', () => {
	it('lists the Windows and Linux choices in order, Off first', () => {
		expect(dragTriggerOptions(false).map(([, label]) => label)).toEqual([
			'Off',
			'Alt',
			'Ctrl',
			'Shift',
			'Meta',
			'Ctrl+Alt',
			'Ctrl+Shift',
			'Alt+Shift',
			'Ctrl+Alt+Shift',
		]);
	});

	it('names the macOS keys Option, Cmd and Control', () => {
		expect(dragTriggerOptions(true).map(([, label]) => label)).toEqual([
			'Off',
			'Option',
			'Cmd',
			'Control',
			'Shift',
			'Cmd+Option',
			'Cmd+Shift',
			'Control+Option',
			'Control+Shift',
			'Option+Shift',
			'Cmd+Option+Shift',
			'Control+Option+Shift',
		]);
	});

	it('offers the effective value of every stored trigger', () => {
		for (const isMac of [false, true]) {
			const values = dragTriggerOptions(isMac).map(([v]) => v);
			for (const [stored] of [...dragTriggerOptions(false), ...dragTriggerOptions(true)]) {
				expect(values).toContain(effectiveTrigger(stored, isMac));
			}
		}
	});
});

describe('isDragTrigger', () => {
	it('accepts stored values and rejects anything else', () => {
		expect(isDragTrigger('ctrl-alt')).toBe(true);
		expect(isDragTrigger('off')).toBe(true);
		expect(isDragTrigger('hyper')).toBe(false);
		expect(isDragTrigger(3)).toBe(false);
	});
});
