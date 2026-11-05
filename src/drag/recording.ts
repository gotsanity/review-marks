// Recording the annotate-on-drag trigger from key presses. Pure: the settings field feeds it
// keydown and keyup events and shows what each step returns.
import { modifiersLabel, triggerFor, type DragTrigger, type Modifiers } from './trigger';

/** What the recorder needs from a `KeyboardEvent`. */
export interface KeyLike extends Modifiers {
	key: string;
}

/** What to show after a key event. */
export type RecordingStep =
	/** Still recording: `label` is the largest combination held so far, empty before the first. */
	| { kind: 'recording'; label: string; ignored?: string }
	/** Esc: keep the old trigger. */
	| { kind: 'cancelled' }
	/** Every key released. `trigger` is null when no stored value can hold the combination. */
	| { kind: 'done'; trigger: DragTrigger | null; label: string };

const MODIFIER_KEYS = ['Control', 'Meta', 'OS', 'Alt', 'AltGraph', 'Shift'];

const count = (m: Modifiers): number => [m.ctrlKey, m.metaKey, m.altKey, m.shiftKey].filter(Boolean).length;

/**
 * One recording. The largest combination held at one moment counts (the first, on a tie), so keys
 * can be released in any order.
 */
export class TriggerRecording {
	private peak: Modifiers = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

	constructor(private readonly isMac: boolean) {}

	keydown(event: KeyLike): RecordingStep {
		if (event.key === 'Escape') return { kind: 'cancelled' };
		if (!MODIFIER_KEYS.includes(event.key)) return { ...this.recording(), ignored: event.key };
		// The key going down is held even if the event doesn't report it yet.
		const key = event.key;
		const held: Modifiers = {
			ctrlKey: event.ctrlKey || key === 'Control',
			metaKey: event.metaKey || key === 'Meta' || key === 'OS',
			altKey: event.altKey || key === 'Alt' || key === 'AltGraph',
			shiftKey: event.shiftKey || key === 'Shift',
		};
		if (count(held) > count(this.peak)) this.peak = held;
		return this.recording();
	}

	keyup(event: KeyLike): RecordingStep {
		// The key going up is released even when the event still reports it held, as WebDriver's do.
		const up = event.key;
		const released =
			!(event.ctrlKey && up !== 'Control') &&
			!(event.metaKey && up !== 'Meta' && up !== 'OS') &&
			!(event.altKey && up !== 'Alt' && up !== 'AltGraph') &&
			!(event.shiftKey && up !== 'Shift');
		if (!released || !MODIFIER_KEYS.includes(event.key) || this.label() === '') return this.recording();
		return { kind: 'done', trigger: triggerFor(this.peak, this.isMac), label: this.label() };
	}

	private recording(): RecordingStep & { kind: 'recording' } {
		return { kind: 'recording', label: this.label() };
	}

	private label(): string {
		return modifiersLabel(this.peak, this.isMac);
	}
}
