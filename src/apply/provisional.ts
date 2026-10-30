// A new Annotation exists in the editor while its Comment is typed, but stays out of the undo
// history until it is saved. Saving takes it out and writes it again, with the Comment, as one
// undo step; cancelling only takes it out. Either way no stray undo step is left behind.
import { ChangeSet, StateEffect, StateField, Transaction, type EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import { isRefusal, parse, planCreate, type CreatePlan, type Placement, type Refusal } from '../core';
import { keepScroll } from '../guards';
import { dispatchAsOneStep } from './editor-target';

interface Provisional {
	id: string;
	/** Takes the provisional Annotation out of the current doc. Mapped through every later change. */
	revert: ChangeSet;
}

const setProvisional = StateEffect.define<Provisional | null>();

/** Register with the editor extensions. Tracks the provisional Annotation of each editor. */
export const provisionalField = StateField.define<Provisional | null>({
	create: () => null,
	update(value, tr) {
		for (const e of tr.effects) if (e.is(setProvisional)) return e.value;
		if (value && tr.docChanged) return { id: value.id, revert: value.revert.map(tr.changes) };
		return value;
	},
});

/** The ID of the Annotation whose Comment is being typed in this editor, if any. */
export function provisionalId(state: EditorState): string | null {
	return state.field(provisionalField, false)?.id ?? null;
}

/** Writes a planned Annotation outside the undo history and remembers how to take it out. */
export function startProvisional(view: EditorView, plan: CreatePlan): void {
	const changes = ChangeSet.of(plan.changes, view.state.doc.length);
	const revert = changes.invert(view.state.doc);
	keepScroll(view, () =>
		view.dispatch({
			changes,
			effects: setProvisional.of({ id: plan.id, revert }),
			annotations: Transaction.addToHistory.of(false),
		}),
	);
}

/** Takes the provisional Annotation out again, leaving nothing in the history. */
export function cancelProvisional(view: EditorView): void {
	const p = view.state.field(provisionalField, false);
	if (!p) return;
	keepScroll(view, () =>
		view.dispatch({
			changes: p.revert,
			effects: setProvisional.of(null),
			annotations: Transaction.addToHistory.of(false),
		}),
	);
}

/**
 * Replaces the provisional Annotation with the same Target and the given Comment, as one undo
 * step, and puts the cursor just after its marker. Returns the plan, a refusal, or null if the
 * provisional Annotation is gone (it was edited away meanwhile).
 */
export function commitProvisional(view: EditorView, comment: string, placement: Placement): CreatePlan | Refusal | null {
	const p = view.state.field(provisionalField, false);
	if (!p) return null;
	const current = parse(view.state.doc.toString()).annotations.find((a) => a.id === p.id);
	if (!current) {
		view.dispatch({ effects: setProvisional.of(null) });
		return null;
	}
	const from = p.revert.mapPos(current.open + 1, -1);
	const to = p.revert.mapPos(current.close, 1);
	cancelProvisional(view);
	const plan = planCreate(parse(view.state.doc.toString()), { from, to, comment, placement });
	if (!isRefusal(plan)) dispatchAsOneStep(view, plan.changes, plan.caret);
	return plan;
}
