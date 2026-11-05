import { describe, expect, it } from 'vitest';
import { conflictCheck, type CommandHotkeys } from './conflicts';

const ctrlShiftA = { modifiers: ['Mod', 'Shift'], key: 'A' };

const annotate: CommandHotkeys = {
	id: 'review-marks:annotate-selection',
	name: 'Review Marks: Annotate selection',
	custom: [ctrlShiftA],
};

describe('conflict check', () => {
	it("names a core command whose default hotkey is the same as one of ours", () => {
		const alsoUsedBy = conflictCheck(
			[annotate, { id: 'editor:toggle-bold', name: 'Toggle bold', defaults: [ctrlShiftA] }],
			false,
		);
		expect(alsoUsedBy(annotate.id, ctrlShiftA)).toEqual(['Toggle bold']);
	});

	it("ignores a command's default hotkey when its hotkeys have been customised, even to none", () => {
		const alsoUsedBy = conflictCheck(
			[
				annotate,
				{ id: 'editor:toggle-bold', name: 'Toggle bold', custom: [], defaults: [ctrlShiftA] },
				{ id: 'other-plugin:run', name: 'Other plugin: Run', custom: [{ modifiers: ['Alt'], key: 'R' }], defaults: [ctrlShiftA] },
			],
			false,
		);
		expect(alsoUsedBy(annotate.id, ctrlShiftA)).toEqual([]);
	});

	it("ignores our own command's default hotkey once a custom one replaces it", () => {
		const replaced = { ...annotate, custom: [{ modifiers: ['Alt'], key: 'A' }], defaults: [ctrlShiftA] };
		const alsoUsedBy = conflictCheck([replaced, { id: 'editor:toggle-bold', name: 'Toggle bold', defaults: [ctrlShiftA] }], false);
		expect(alsoUsedBy(annotate.id, { modifiers: ['Alt'], key: 'A' })).toEqual([]);
	});

	it("names another plugin's command whose custom hotkey is the same", () => {
		const alsoUsedBy = conflictCheck(
			[annotate, { id: 'other-plugin:run', name: 'Other plugin: Run', custom: [{ modifiers: ['Shift', 'Mod'], key: 'A' }] }],
			false,
		);
		expect(alsoUsedBy(annotate.id, ctrlShiftA)).toEqual(['Other plugin: Run']);
	});

	it('is no conflict with itself, even when the command has the same hotkey twice', () => {
		const alsoUsedBy = conflictCheck([{ ...annotate, custom: [ctrlShiftA, ctrlShiftA] }], false);
		expect(alsoUsedBy(annotate.id, ctrlShiftA)).toEqual([]);
	});

	it('names every other command that uses the hotkey, in alphabetical order', () => {
		const alsoUsedBy = conflictCheck(
			[
				annotate,
				{ id: 'editor:toggle-bold', name: 'Toggle bold', defaults: [ctrlShiftA] },
				{ id: 'review-marks:edit-comment', name: 'Review Marks: Edit comment', custom: [ctrlShiftA] },
				{ id: 'app:reload', name: 'Reload app without saving', defaults: [{ modifiers: ['Mod'], key: 'R' }] },
			],
			false,
		);
		expect(alsoUsedBy(annotate.id, ctrlShiftA)).toEqual(['Review Marks: Edit comment', 'Toggle bold']);
	});

	it('matches hotkeys by their printed text, which depends on the platform', () => {
		const commands: CommandHotkeys[] = [annotate, { id: 'other-plugin:run', name: 'Other plugin: Run', custom: [{ modifiers: ['Ctrl', 'Shift'], key: 'A' }] }];
		expect(conflictCheck(commands, false)(annotate.id, ctrlShiftA)).toEqual(['Other plugin: Run']);
		expect(conflictCheck(commands, true)(annotate.id, ctrlShiftA)).toEqual([]);
	});
});
