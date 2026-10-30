// Live Preview tables: Obsidian draws them as a widget of rendered HTML that decorations can't
// reach, so after each update this decorates the rendered cells that hold Annotations. Clicking
// into a cell opens Obsidian's cell editor, which shows the raw syntax (see cell-editor.ts).
// Everything about the widget goes through the guard in guards.ts; if it fails, cells stay as
// Obsidian rendered them.
import { editorLivePreviewField } from 'obsidian';
import type { Extension } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import { excerpt, type Annotation } from '../core';
import { provisionalId } from '../apply/provisional';
import { isTableCellEditor, liveTableCells } from '../guards';
import { decorateRendered, undecorate } from '../rendered/decorate';
import type { ReviewMarksSettings } from '../settings';
import { badgeText } from './badge';
import { annotationsField } from './live-preview';

/** Set on a decorated cell: what it was decorated for, so unchanged cells are left alone. */
const SIGNATURE = 'rmSig';

function decorateTables(view: EditorView, settings: ReviewMarksSettings): void {
	const state = view.state;
	const live = state.field(editorLivePreviewField, false) === true;
	const annotations = state.field(annotationsField, false) ?? [];
	const typing = provisionalId(state);
	const text = state.doc.toString();
	const badgeOf = (a: Annotation) => badgeText(a.id, a.definition?.comment ?? null, typing === a.id, (c) => excerpt(c, settings.excerptLength));
	const badge = (a: Annotation) => createSpan({ cls: 'rm-badge', text: badgeOf(a), attr: { 'data-rm-id': a.id } });

	for (const cells of liveTableCells(view)) {
		for (const cell of cells) {
			const hits = live ? annotations.filter((a) => a.open < cell.to && a.markerEnd > cell.from) : [];
			const decorated = cell.el.dataset[SIGNATURE] !== undefined;
			if (hits.length === 0) {
				if (decorated) {
					undecorate(cell.el);
					delete cell.el.dataset[SIGNATURE];
				}
				continue;
			}
			const signature = [text.slice(cell.from, cell.to), ...hits.map(badgeOf)].join('\u0000');
			// Obsidian re-renders a cell after it is edited, dropping the decorations but not the signature.
			if (cell.el.dataset[SIGNATURE] === signature && cell.el.querySelector('.rm-hidden')) continue;
			if (decorateRendered(cell.el, text, cell, hits, badge)) cell.el.dataset[SIGNATURE] = signature;
		}
	}
}

/** Decorates Annotations inside Live Preview tables. `settings` is read on every pass. */
export function tableCellDecorations(settings: () => ReviewMarksSettings): Extension {
	return ViewPlugin.define((view) => {
		const schedule = () => {
			if (isTableCellEditor(view)) return;
			view.requestMeasure({
				key: decorateTables,
				read: () => null,
				write: () => {
					try {
						decorateTables(view, settings());
					} catch (e) {
						// The widget is not ours: never let it break the editor.
						console.debug('[review-marks] table decoration skipped', e);
					}
				},
			});
		};
		schedule();
		return { update: (_u: ViewUpdate) => schedule() };
	});
}
