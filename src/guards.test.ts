// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { isExportRender, tableWidgetCells } from './guards';
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
