import { describe, expect, it } from 'vitest';
import { effectiveTrigger, isDragTrigger, triggerFor, triggerHeld, triggerLabel } from './trigger';

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

describe('triggerFor: the held modifiers as a stored trigger', () => {
	it('stores every Windows and Linux combination', () => {
		expect(triggerFor(keys('alt'), false)).toBe('alt');
		expect(triggerFor(keys('ctrl'), false)).toBe('mod');
		expect(triggerFor(keys('shift'), false)).toBe('shift');
		expect(triggerFor(keys('meta'), false)).toBe('meta');
		expect(triggerFor(keys('ctrl alt'), false)).toBe('mod-alt');
		expect(triggerFor(keys('ctrl shift'), false)).toBe('mod-shift');
		expect(triggerFor(keys('alt shift'), false)).toBe('alt-shift');
		expect(triggerFor(keys('ctrl alt shift'), false)).toBe('mod-alt-shift');
	});

	it('stores every macOS combination, reading Cmd as mod and Control as ctrl', () => {
		expect(triggerFor(keys('alt'), true)).toBe('alt');
		expect(triggerFor(keys('meta'), true)).toBe('mod');
		expect(triggerFor(keys('ctrl'), true)).toBe('ctrl');
		expect(triggerFor(keys('shift'), true)).toBe('shift');
		expect(triggerFor(keys('meta alt'), true)).toBe('mod-alt');
		expect(triggerFor(keys('meta shift'), true)).toBe('mod-shift');
		expect(triggerFor(keys('ctrl alt'), true)).toBe('ctrl-alt');
		expect(triggerFor(keys('ctrl shift'), true)).toBe('ctrl-shift');
		expect(triggerFor(keys('alt shift'), true)).toBe('alt-shift');
		expect(triggerFor(keys('meta alt shift'), true)).toBe('mod-alt-shift');
		expect(triggerFor(keys('ctrl alt shift'), true)).toBe('ctrl-alt-shift');
	});

	it('is Off when nothing is held', () => {
		expect(triggerFor(keys(''), false)).toBe('off');
		expect(triggerFor(keys(''), true)).toBe('off');
	});

	it("can't store combinations no trigger value holds", () => {
		for (const held of ['ctrl meta', 'meta alt', 'meta shift', 'ctrl meta alt shift']) {
			expect(triggerFor(keys(held), false)).toBeNull();
		}
		for (const held of ['ctrl meta', 'ctrl meta alt', 'ctrl meta alt shift']) {
			expect(triggerFor(keys(held), true)).toBeNull();
		}
	});
});

describe('triggerLabel: a stored trigger in the hotkey printer style', () => {
	it('prints Windows and Linux triggers as "Ctrl + Alt"', () => {
		expect(triggerLabel('off', false)).toBe('Off');
		expect(triggerLabel('alt', false)).toBe('Alt');
		expect(triggerLabel('mod', false)).toBe('Ctrl');
		expect(triggerLabel('meta', false)).toBe('Win');
		expect(triggerLabel('mod-alt', false)).toBe('Ctrl + Alt');
		expect(triggerLabel('mod-alt-shift', false)).toBe('Ctrl + Alt + Shift');
	});

	it('prints macOS triggers as "⌘ ⌥"', () => {
		expect(triggerLabel('off', true)).toBe('Off');
		expect(triggerLabel('mod', true)).toBe('⌘');
		expect(triggerLabel('ctrl', true)).toBe('⌃');
		expect(triggerLabel('mod-alt', true)).toBe('⌘ ⌥');
		expect(triggerLabel('ctrl-alt-shift', true)).toBe('⌃ ⌥ ⇧');
	});

	it('prints a value stored on the other platform as this platform reads it', () => {
		expect(triggerLabel('ctrl-shift', false)).toBe('Ctrl + Shift');
		expect(triggerLabel('meta', true)).toBe('⌘');
	});
});

describe('recording the keys a stored trigger shows', () => {
	const STORED = ['off', 'alt', 'mod', 'ctrl', 'shift', 'meta', 'mod-alt', 'mod-shift', 'ctrl-alt', 'ctrl-shift', 'alt-shift', 'mod-alt-shift', 'ctrl-alt-shift'] as const;

	// Every set of held modifiers, from none to all four.
	const ALL_HELD = Array.from({ length: 16 }, (_, bits) =>
		['ctrl', 'meta', 'alt', 'shift'].filter((_, i) => bits & (1 << i)).join(' '),
	);

	it('records the keys that drag with a stored trigger as that same trigger', () => {
		for (const isMac of [false, true]) {
			for (const stored of STORED.filter((t) => t !== 'off')) {
				const held = ALL_HELD.filter((h) => triggerHeld(keys(h), stored, isMac));
				expect(held).toHaveLength(1);
				expect(triggerFor(keys(held[0] as string), isMac)).toBe(effectiveTrigger(stored, isMac));
			}
		}
	});

	it('records only combinations that drag with the trigger it records', () => {
		for (const isMac of [false, true]) {
			for (const held of ALL_HELD) {
				const trigger = triggerFor(keys(held), isMac);
				if (trigger && trigger !== 'off') expect(triggerHeld(keys(held), trigger, isMac)).toBe(true);
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
