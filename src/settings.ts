import type { Placement } from './core';
import { DEFAULT_DRAG_TRIGGER, isDragTrigger, type DragTrigger } from './drag/trigger';

export interface ReviewMarksSettings {
	/** Where the Comment of a new Annotation is written. Its control is `addPlacementSetting`. */
	placement: Placement;
	/** Show a badge with the start of the Comment after each Target. */
	showBadge: boolean;
	/** How many characters of the Comment the badge shows. */
	excerptLength: number;
	/** Hovering a Target or badge shows the full Comment (tapping, on mobile). */
	showHover: boolean;
	/** Leave review footnotes out of Reading view's footnote list. */
	hideReviewFootnotes: boolean;
	/** Modifier keys held while drag-selecting to annotate at once (src/drag/trigger.ts). */
	dragTrigger: DragTrigger;
	/** Show "N annotations" for the active note in the status bar (desktop). */
	showStatusBar: boolean;
	/** The Target highlight, `#rrggbb`, or empty for the theme's highlight colour (src/highlight.ts). */
	highlightColour: string;
}

export const DEFAULT_SETTINGS: ReviewMarksSettings = {
	placement: 'end-of-section',
	showBadge: true,
	excerptLength: 32,
	showHover: true,
	hideReviewFootnotes: true,
	dragTrigger: DEFAULT_DRAG_TRIGGER,
	showStatusBar: true,
	highlightColour: '',
};

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);

/** Stored data merged over the defaults; unknown or mistyped values fall back to the default. */
export function settingsFrom(data: unknown): ReviewMarksSettings {
	const stored = typeof data === 'object' && data !== null ? (data as Partial<Record<keyof ReviewMarksSettings, unknown>>) : {};
	return {
		placement:
			stored.placement === 'end-of-section' || stored.placement === 'end-of-note'
				? stored.placement
				: DEFAULT_SETTINGS.placement,
		showBadge: bool(stored.showBadge, DEFAULT_SETTINGS.showBadge),
		excerptLength:
			typeof stored.excerptLength === 'number' && stored.excerptLength > 0
				? Math.floor(stored.excerptLength)
				: DEFAULT_SETTINGS.excerptLength,
		showHover: bool(stored.showHover, DEFAULT_SETTINGS.showHover),
		hideReviewFootnotes: bool(stored.hideReviewFootnotes, DEFAULT_SETTINGS.hideReviewFootnotes),
		dragTrigger: isDragTrigger(stored.dragTrigger) ? stored.dragTrigger : DEFAULT_SETTINGS.dragTrigger,
		showStatusBar: bool(stored.showStatusBar, DEFAULT_SETTINGS.showStatusBar),
		highlightColour:
			typeof stored.highlightColour === 'string' && /^#[0-9a-f]{6}$/i.test(stored.highlightColour)
				? stored.highlightColour.toLowerCase()
				: DEFAULT_SETTINGS.highlightColour,
	};
}

/**
 * The live settings. `update` validates, saves and then tells every `onChange` listener, which is
 * how a changed setting takes effect at once in open notes.
 */
export class SettingsStore {
	private readonly listeners = new Set<(settings: ReviewMarksSettings) => void>();

	constructor(
		public current: ReviewMarksSettings,
		private readonly save: (settings: ReviewMarksSettings) => Promise<void>,
	) {}

	async update(patch: Partial<ReviewMarksSettings>): Promise<void> {
		this.current = settingsFrom({ ...this.current, ...patch });
		await this.save(this.current);
		for (const listener of this.listeners) listener(this.current);
	}

	/** Calls `listener` after every change. Returns a function that stops it. */
	onChange(listener: (settings: ReviewMarksSettings) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}
