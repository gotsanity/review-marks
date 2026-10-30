// Live Preview: Targets are highlighted, `{` and `}[^rN]` are hidden unless the cursor is in the
// Annotation, and a badge shows the start of the Comment. A StateField rather than a ViewPlugin,
// because a Target's syntax can sit outside the visible ranges and decorations must not lag.
import { editorLivePreviewField } from 'obsidian';
import { Prec, StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';
import { blockPrefixLength, excerpt, isTableLine, parse, type Annotation } from '../core';
import { provisionalField, provisionalId } from '../apply/provisional';
import type { ReviewMarksSettings } from '../settings';
import { BadgeWidget, badgeText } from './badge';

/** Parsed Annotations of the editor's note, kept current on every edit. */
export const annotationsField = StateField.define<Annotation[]>({
	create: (s) => parse(s.doc.toString()).annotations,
	update: (value, tr) => (tr.docChanged ? parse(tr.state.doc.toString()).annotations : value),
});

/** Dispatch to rebuild the decorations, for example after a settings change. */
export const refreshLivePreview = StateEffect.define<null>();

// The syntax shows only while the editor has focus: while the comment box has it, the cursor
// sits inside the new Target but the syntax stays hidden.
const setFocus = StateEffect.define<boolean>();
const focusField = StateField.define<boolean>({
	create: () => false,
	update(value, tr) {
		for (const e of tr.effects) if (e.is(setFocus)) value = e.value;
		return value;
	},
});
const focusTracking: Extension = [
	focusField,
	EditorView.focusChangeEffect.of((_state, focusing) => setFocus.of(focusing)),
	// An editor focused before the plugin loaded gets no focus event, and CodeMirror drops its focus
	// transaction when another lands first. So compare the field with the real focus after updates.
	ViewPlugin.define((view) => {
		let queued = false;
		const sync = () => {
			if (queued) return;
			queued = true;
			queueMicrotask(() => {
				queued = false;
				if (view.dom.isConnected && view.state.field(focusField, false) !== view.hasFocus) {
					view.dispatch({ effects: setFocus.of(view.hasFocus) });
				}
			});
		};
		sync();
		return {
			update: (u: ViewUpdate) => {
				if (u.view.hasFocus !== u.state.field(focusField, false)) sync();
			},
		};
	}),
];

const hidden = Decoration.replace({});
const syntaxMark = Decoration.mark({ class: 'rm-syntax' });

function buildDecorations(state: EditorState, settings: () => ReviewMarksSettings): DecorationSet {
	if (!state.field(editorLivePreviewField, false)) return Decoration.none;
	const doc = state.doc;
	const focused = state.field(focusField, false) === true;
	const typing = provisionalId(state);
	const excerptLength = settings().excerptLength;
	const out: Range<Decoration>[] = [];

	for (const a of state.field(annotationsField)) {
		// Table rows are drawn by Obsidian's table widget; ticket #24 decorates inside it.
		if (isTableLine(doc.lineAt(a.open).text) || isTableLine(doc.lineAt(a.close).text)) continue;
		// Revealed while the cursor is anywhere from just before `{` to inside the marker. Just after
		// the marker counts as outside, so typing on after a new Annotation stays calm.
		const revealed = focused && state.selection.ranges.some((r) => r.from < a.markerEnd && r.to >= a.open);
		const mark = Decoration.mark({
			class: revealed ? 'rm-target rm-revealed' : 'rm-target',
			attributes: { 'data-rm-id': a.id },
		});
		for (let pos = a.open + 1; pos < a.close; ) {
			const line = doc.lineAt(pos);
			const start = pos === line.from ? pos + blockPrefixLength(line.text) : pos;
			const end = Math.min(line.to, a.close);
			if (end > start) out.push(mark.range(start, end));
			pos = line.to + 1;
		}
		if (revealed) {
			out.push(syntaxMark.range(a.open, a.open + 1), syntaxMark.range(a.close, a.markerEnd));
		} else {
			const text = badgeText(a.id, a.definition?.comment ?? null, typing === a.id, (c) => excerpt(c, excerptLength));
			out.push(
				hidden.range(a.open, a.open + 1),
				Decoration.replace({ widget: new BadgeWidget(a.id, text) }).range(a.close, a.markerEnd),
			);
		}
	}
	return Decoration.set(out, true);
}

/** The Live Preview extension. `settings` is read on every rebuild. */
export function livePreview(settings: () => ReviewMarksSettings): Extension {
	const decorations = StateField.define<DecorationSet>({
		create: (s) => buildDecorations(s, settings),
		update(value, tr) {
			const modeChanged =
				tr.startState.field(editorLivePreviewField, false) !== tr.state.field(editorLivePreviewField, false);
			const typingChanged =
				tr.startState.field(provisionalField, false) !== tr.state.field(provisionalField, false);
			const effects = tr.effects.some((e) => e.is(setFocus) || e.is(refreshLivePreview));
			if (tr.docChanged || tr.selection || modeChanged || typingChanged || effects) {
				return buildDecorations(tr.state, settings);
			}
			return value;
		},
		provide: (f) => EditorView.decorations.from(f),
	});
	return [annotationsField, focusTracking, Prec.highest(decorations)];
}
