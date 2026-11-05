// The annotate-on-drag trigger: which modifier keys must be held. Pure, so the platform is a
// parameter (callers pass `Platform.isMacOS`).
//
// 'mod' is the primary modifier: Ctrl on Windows and Linux, Cmd on macOS. 'meta' (the Windows
// key) is offered on Windows and Linux only; 'ctrl' (the real Control key) on macOS only. Settings
// sync between devices, so `effectiveTrigger` maps a value stored on the other platform.
import { printModifiers } from '../hotkeys/printer';

const TRIGGERS = [
	'off',
	'alt',
	'mod',
	'ctrl',
	'shift',
	'meta',
	'mod-alt',
	'mod-shift',
	'ctrl-alt',
	'ctrl-shift',
	'alt-shift',
	'mod-alt-shift',
	'ctrl-alt-shift',
] as const;

export type DragTrigger = (typeof TRIGGERS)[number];

export const DEFAULT_DRAG_TRIGGER: DragTrigger = 'alt';

export function isDragTrigger(value: unknown): value is DragTrigger {
	return typeof value === 'string' && (TRIGGERS as readonly string[]).includes(value);
}

/** The modifier state of a pointer event. */
export interface Modifiers {
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}

/** The stored trigger as this platform reads it. */
export function effectiveTrigger(trigger: DragTrigger, isMac: boolean): DragTrigger {
	if (isMac) return trigger === 'meta' ? 'mod' : trigger;
	return trigger.startsWith('ctrl') ? (trigger.replace('ctrl', 'mod') as DragTrigger) : trigger;
}

/**
 * The trigger that the held modifiers set, or null when no stored value can hold them (Ctrl + Win
 * on Windows and Linux, for example). Nothing held is Off.
 */
export function triggerFor(keys: Modifiers, isMac: boolean): DragTrigger | null {
	const parts = [
		(isMac ? keys.metaKey : keys.ctrlKey) && 'mod',
		isMac && keys.ctrlKey && 'ctrl',
		!isMac && keys.metaKey && 'meta',
		keys.altKey && 'alt',
		keys.shiftKey && 'shift',
	].filter((part) => part !== false);
	const value = parts.length ? parts.join('-') : 'off';
	return isDragTrigger(value) ? value : null;
}

/** Whether exactly the trigger's keys are held. Never true when the trigger is Off. */
export function triggerHeld(keys: Modifiers, trigger: DragTrigger, isMac: boolean): boolean {
	if (effectiveTrigger(trigger, isMac) === 'off') return false;
	const want = triggerKeys(trigger, isMac);
	return keys.ctrlKey === want.ctrlKey && keys.metaKey === want.metaKey && keys.altKey === want.altKey && keys.shiftKey === want.shiftKey;
}

/** The keys to hold for the trigger on this platform. None for Off. */
function triggerKeys(trigger: DragTrigger, isMac: boolean): Modifiers {
	const parts = effectiveTrigger(trigger, isMac).split('-');
	const mod = parts.includes('mod');
	return {
		ctrlKey: parts.includes('ctrl') || (mod && !isMac),
		metaKey: parts.includes('meta') || (mod && isMac),
		altKey: parts.includes('alt'),
		shiftKey: parts.includes('shift'),
	};
}

/** Held keys in the hotkey printer's style: "Ctrl + Alt" on Windows and Linux, "⌘ ⌥" on macOS. */
export function modifiersLabel(keys: Modifiers, isMac: boolean): string {
	const names = [keys.ctrlKey && 'Ctrl', keys.metaKey && 'Meta', keys.altKey && 'Alt', keys.shiftKey && 'Shift'];
	return printModifiers(
		names.filter((name) => name !== false),
		isMac,
	);
}

/** A stored trigger as this platform shows it: "Off", or its keys like `modifiersLabel`. */
export function triggerLabel(trigger: DragTrigger, isMac: boolean): string {
	return effectiveTrigger(trigger, isMac) === 'off' ? 'Off' : modifiersLabel(triggerKeys(trigger, isMac), isMac);
}
