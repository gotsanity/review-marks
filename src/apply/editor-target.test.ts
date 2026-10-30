import { describe, expect, it } from 'vitest';
import type { Editor } from 'obsidian';
import { planRemove } from '../core';
import { changeTargetFor } from './editor-target';

/** An Obsidian editor without a CodeMirror view: only the plain Editor API. */
function plainEditor(initial: string) {
	const state = { text: initial, transactions: 0 };
	const offsetToPos = (offset: number) => {
		const before = state.text.slice(0, offset).split('\n');
		return { line: before.length - 1, ch: before[before.length - 1]?.length ?? 0 };
	};
	const posToOffset = (pos: { line: number; ch: number }) =>
		state.text.split('\n').slice(0, pos.line).reduce((n, l) => n + l.length + 1, 0) + pos.ch;
	const editor = {
		getValue: () => state.text,
		offsetToPos,
		transaction(tx: { changes: { from: { line: number; ch: number }; to: { line: number; ch: number }; text: string }[] }) {
			state.transactions++;
			const changes = tx.changes.map((c) => ({ from: posToOffset(c.from), to: posToOffset(c.to), text: c.text }));
			for (const c of changes.sort((a, b) => b.from - a.from)) state.text = state.text.slice(0, c.from) + c.text + state.text.slice(c.to);
		},
	};
	return { editor: editor as unknown as Editor, state };
}

describe('changeTargetFor an editor without a CodeMirror view', () => {
	it('writes the plan as one editor transaction', async () => {
		const { editor, state } = plainEditor('Kell {fails}[^r1] the save.\n\n[^r1]: Why?\n');
		await changeTargetFor(editor).apply((doc) => planRemove(doc, 'r1'));
		expect(state.text).toBe('Kell fails the save.\n');
		expect(state.transactions).toBe(1);
	});

	it('changes nothing on a refusal', async () => {
		const { editor, state } = plainEditor('Plain.\n');
		const result = await changeTargetFor(editor).apply((doc) => planRemove(doc, 'r1'));
		expect(result).toMatchObject({ refusal: 'not-found' });
		expect(state.text).toBe('Plain.\n');
		expect(state.transactions).toBe(0);
	});
});
