// The annotate-on-drag trigger: which modifier keys must be held. Pure, so the platform is a
// parameter (callers pass `Platform.isMacOS`).
//
// 'mod' is the primary modifier: Ctrl on Windows and Linux, Cmd on macOS. 'meta' (the Windows
// key) is offered on Windows and Linux only; 'ctrl' (the real Control key) on macOS only. Settings
// sync between devices, so `effectiveTrigger` maps a value stored on the other platform.

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

const OPTIONS_PC: [DragTrigger, string][] = [
	['off', 'Off'],
	['alt', 'Alt'],
	['mod', 'Ctrl'],
	['shift', 'Shift'],
	['meta', 'Meta'],
	['mod-alt', 'Ctrl+Alt'],
	['mod-shift', 'Ctrl+Shift'],
	['alt-shift', 'Alt+Shift'],
	['mod-alt-shift', 'Ctrl+Alt+Shift'],
];

const OPTIONS_MAC: [DragTrigger, string][] = [
	['off', 'Off'],
	['alt', 'Option'],
	['mod', 'Cmd'],
	['ctrl', 'Control'],
	['shift', 'Shift'],
	['mod-alt', 'Cmd+Option'],
	['mod-shift', 'Cmd+Shift'],
	['ctrl-alt', 'Control+Option'],
	['ctrl-shift', 'Control+Shift'],
	['alt-shift', 'Option+Shift'],
	['mod-alt-shift', 'Cmd+Option+Shift'],
	['ctrl-alt-shift', 'Control+Option+Shift'],
];

/** The choices for the setting on this platform, as [stored value, label]. */
export function dragTriggerOptions(isMac: boolean): [DragTrigger, string][] {
	return isMac ? OPTIONS_MAC : OPTIONS_PC;
}

/** The stored trigger as this platform reads it. */
export function effectiveTrigger(trigger: DragTrigger, isMac: boolean): DragTrigger {
	if (isMac) return trigger === 'meta' ? 'mod' : trigger;
	return trigger.startsWith('ctrl') ? (trigger.replace('ctrl', 'mod') as DragTrigger) : trigger;
}

/** Whether exactly the trigger's keys are held. Never true when the trigger is Off. */
export function triggerHeld(keys: Modifiers, trigger: DragTrigger, isMac: boolean): boolean {
	const t = effectiveTrigger(trigger, isMac);
	if (t === 'off') return false;
	const parts = t.split('-');
	const mod = parts.includes('mod');
	const want = {
		ctrl: parts.includes('ctrl') || (mod && !isMac),
		meta: parts.includes('meta') || (mod && isMac),
		alt: parts.includes('alt'),
		shift: parts.includes('shift'),
	};
	return keys.ctrlKey === want.ctrl && keys.metaKey === want.meta && keys.altKey === want.alt && keys.shiftKey === want.shift;
}
