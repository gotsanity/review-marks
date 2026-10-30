// @vitest-environment happy-dom
import type { MarkdownPreviewView } from 'obsidian';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StateEffect } from '@codemirror/state';
import { caretFromPoint, focusChangeTracking, isExportRender, isTableWidgetChrome, keepsOwnDrag, scrollPreviewTo, tableWidgetAt, tableWidgetCells } from './guards';
import { block } from './test-support/fake-dom';

const TEXT = 'Intro.\n\n| Name | Result |\n|---|---|\n| Doreth Kell | {17 (fail)}[^r9] |\n';
const rows = [
	{ from: TEXT.indexOf('| Name'), text: '| Name | Result |' },
	{ from: TEXT.indexOf('| Doreth'), text: '| Doreth Kell | {17 (fail)}[^r9] |' },
];
const handle = '<div class="table-row-drag-handle"></div>';
const cell = (tag: string, text: string, extra = '') => `<${tag}><div class="table-cell-wrapper">${text}</div>${extra}</${tag}>`;

/** Live Preview's table widget, as Obsidian 1.7.4 and 1.14 draw it. */
function widget(body = `<tr>${cell('td', 'Doreth Kell', handle)}${cell('td', '{17 (fail)}r9')}</tr>`): HTMLElement {
	return block(
		'<div class="cm-embed-block cm-table-widget"><div class="table-wrapper"><table class="table-editor">' +
			`<thead><tr>${cell('th', 'Name', handle)}${cell('th', 'Result')}</tr></thead><tbody>${body}</tbody>` +
			'</table></div></div>',
	);
}

describe('tableWidgetCells', () => {
	it('pairs each rendered cell with its source range', () => {
		const cells = tableWidgetCells(widget(), rows);
		expect(cells?.map((c) => [c.el.textContent, TEXT.slice(c.from, c.to)])).toEqual([
			['Name', 'Name'],
			['Result', 'Result'],
			['Doreth Kell', 'Doreth Kell'],
			['{17 (fail)}r9', '{17 (fail)}[^r9]'],
		]);
		expect(cells?.every((c) => c.el.classList.contains('table-cell-wrapper'))).toBe(true);
	});

	it('skips the wrapper of a cell being edited', () => {
		const editing = `<tr>${cell('td', 'Doreth Kell')}<td><div class="table-cell-wrapper">{17 (fail)}r9</div><div class="table-cell-wrapper"><div class="cm-editor"></div></div></td></tr>`;
		const cells = tableWidgetCells(widget(editing), rows);
		expect(cells?.[3]?.el.textContent).toBe('{17 (fail)}r9');
	});

	it('fails when the rows do not match the source', () => {
		expect(tableWidgetCells(widget(''), rows)).toBeNull();
	});

	it('fails when a row has a different number of cells', () => {
		expect(tableWidgetCells(widget(`<tr>${cell('td', 'Doreth Kell')}</tr>`), rows)).toBeNull();
	});

	it('fails when a cell has no content wrapper', () => {
		expect(tableWidgetCells(widget('<tr><td>Doreth Kell</td><td>{17 (fail)}r9</td></tr>'), rows)).toBeNull();
	});

	it('fails when there is no table in the widget', () => {
		expect(tableWidgetCells(block('<div class="cm-table-widget"></div>'), rows)).toBeNull();
	});
});

describe('caretFromPoint', () => {
	const text = document.createTextNode('Kell fails');

	it('uses the standard caretPositionFromPoint first', () => {
		const doc = { caretPositionFromPoint: () => ({ offsetNode: text, offset: 3 }), caretRangeFromPoint: () => null };
		expect(caretFromPoint(doc, 10, 20)).toEqual({ node: text, offset: 3 });
	});

	it('falls back to caretRangeFromPoint', () => {
		const range = document.createRange();
		range.setStart(text, 5);
		expect(caretFromPoint({ caretRangeFromPoint: () => range }, 10, 20)).toEqual({ node: text, offset: 5 });
	});

	it('is null when there is no caret at the point', () => {
		expect(caretFromPoint({ caretPositionFromPoint: () => null }, 10, 20)).toBeNull();
	});

	it('is undefined when neither API exists', () => {
		expect(caretFromPoint({}, 10, 20)).toBeUndefined();
	});
});

describe('isExportRender', () => {
	const ctx = (displayMode?: boolean) => ({ getSectionInfo: () => null, displayMode });

	it('is true for PDF export and MarkdownRenderer.render, which render in display mode', () => {
		expect(isExportRender(block('<p>x</p>'), ctx(true))).toBe(true);
	});

	it('is false for embeds and table cells, which Obsidian renders with displayMode false', () => {
		expect(isExportRender(block('<p>x</p>'), ctx(false))).toBe(false);
	});

	it('is false inside an editor, even without the flag', () => {
		const editor = block('<div class="cm-editor"><div class="cell"></div></div>');
		expect(isExportRender(editor.querySelector('.cell') as HTMLElement, ctx())).toBe(false);
		expect(isExportRender(block('<p>x</p>'), ctx())).toBe(true);
	});

	it('is false when the render has section info', () => {
		const withInfo = { getSectionInfo: () => ({}), displayMode: true };
		expect(isExportRender(block('<p>x</p>'), withInfo)).toBe(false);
	});
});

/**
 * Reading view for a long note whose Target (r1) is rendered only once the view has scrolled
 * near it. It ignores `applyScroll` for its first `busyFrames` frames, as Obsidian does while it is
 * still rendering a note it has just switched to. `frame()` runs one animation frame.
 */
function readingView(busyFrames: number) {
	const containerEl = block('<p>Paragraph 0 of filler text.</p>');
	const queued: FrameRequestCallback[] = [];
	vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => queued.push(cb));
	let frames = 0;
	let scroll = 0;
	const centred: unknown[] = [];
	const preview = {
		containerEl,
		getScroll: () => scroll,
		applyScroll: (line: number) => {
			if (frames >= busyFrames) scroll = line;
		},
	};
	const target = () => containerEl.querySelector<HTMLElement>('.rm-target[data-rm-id="r1"]');
	return {
		preview: preview as unknown as MarkdownPreviewView,
		target,
		/** The options of each `scrollIntoView` call on the Target. */
		centred,
		frame() {
			frames++;
			if (scroll >= 150 && !target()) {
				const el = containerEl.createSpan({ cls: 'rm-target', text: 'far target' });
				el.dataset.rmId = 'r1';
				el.scrollIntoView = (options) => centred.push(options);
			}
			for (const cb of queued.splice(0)) cb(0);
		},
	};
}

describe('scrollPreviewTo', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('scrolls to the Target and flashes it', () => {
		const view = readingView(0);
		scrollPreviewTo(view.preview, 162, 'r1');
		for (let i = 0; i < 3; i++) view.frame();
		expect(view.centred).toEqual([{ block: 'center' }]);
		expect(view.target()?.classList.contains('rm-flash')).toBe(true);
	});

	it('still gets there when Reading view is busy rendering at first', () => {
		const view = readingView(20);
		scrollPreviewTo(view.preview, 162, 'r1');
		for (let i = 0; i < 30; i++) view.frame();
		expect(view.centred).toEqual([{ block: 'center' }]);
		expect(view.target()?.classList.contains('rm-flash')).toBe(true);
	});
});

describe('the Live Preview table widget', () => {
	it('finds the widget an element is in', () => {
		const w = widget();
		const td = w.querySelector('td') as HTMLElement;
		expect(tableWidgetAt(td)).toBe(w.querySelector('.cm-table-widget'));
		expect(tableWidgetAt(block('<p>x</p>'))).toBeNull();
	});

	it("tells the widget's drag handles from cell content", () => {
		const w = widget();
		expect(isTableWidgetChrome(w.querySelector('.table-row-drag-handle') as Element)).toBe(true);
		expect(isTableWidgetChrome(w.querySelector('.table-cell-wrapper') as Element)).toBe(false);
	});
});

describe('keepsOwnDrag', () => {
	it('leaves drags on embeds, badges and the comment box alone', () => {
		const root = block(
			'<div class="cm-embed-block"><p class="a">x</p></div><div class="markdown-embed"><p class="b">x</p></div>' +
				'<div class="internal-embed"><p class="c">x</p></div><span class="rm-badge">x</span><div class="rm-cbox"><p class="d">x</p></div><p class="e">x</p>',
		);
		for (const cls of ['a', 'b', 'c', 'd']) expect(keepsOwnDrag(root.querySelector(`.${cls}`) as Element)).toBe(true);
		expect(keepsOwnDrag(root.querySelector('.rm-badge') as Element)).toBe(true);
		expect(keepsOwnDrag(root.querySelector('.e') as Element)).toBe(false);
	});

	it('takes drags in a Live Preview table, which is drawn as an embed block', () => {
		const w = widget();
		expect(keepsOwnDrag(w.querySelector('.table-cell-wrapper') as Element)).toBe(false);
	});
});

describe('focusChangeTracking', () => {
	const effect = StateEffect.define<boolean>();

	it('maps focus changes to the effect where CodeMirror has focusChangeEffect', () => {
		expect(focusChangeTracking((focusing) => effect.of(focusing))).not.toEqual([]);
	});

	it('is no extension, rather than an error, where it is missing', () => {
		expect(focusChangeTracking((focusing) => effect.of(focusing), {})).toEqual([]);
	});
});
