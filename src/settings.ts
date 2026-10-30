import type { Placement } from './core';
import { DEFAULT_DRAG_TRIGGER, isDragTrigger, type DragTrigger } from './drag/trigger';

export interface ReviewMarksSettings {
	/** Where the Comment of a new Annotation is written. Its setting arrives with ticket #27. */
	placement: Placement;
	/** How many characters of the Comment the badge shows. */
	excerptLength: number;
	/** Modifier keys held while drag-selecting to annotate at once (src/drag/trigger.ts). */
	dragTrigger: DragTrigger;
}

export const DEFAULT_SETTINGS: ReviewMarksSettings = {
	placement: 'end-of-section',
	excerptLength: 32,
	dragTrigger: DEFAULT_DRAG_TRIGGER,
};

/** Stored data merged over the defaults; unknown or mistyped values fall back to the default. */
export function settingsFrom(data: unknown): ReviewMarksSettings {
	const stored = typeof data === 'object' && data !== null ? (data as Partial<Record<keyof ReviewMarksSettings, unknown>>) : {};
	return {
		placement:
			stored.placement === 'end-of-section' || stored.placement === 'end-of-note'
				? stored.placement
				: DEFAULT_SETTINGS.placement,
		excerptLength:
			typeof stored.excerptLength === 'number' && stored.excerptLength > 0
				? Math.floor(stored.excerptLength)
				: DEFAULT_SETTINGS.excerptLength,
		dragTrigger: isDragTrigger(stored.dragTrigger) ? stored.dragTrigger : DEFAULT_SETTINGS.dragTrigger,
	};
}
