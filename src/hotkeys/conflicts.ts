// The Hotkeys section's conflict check: which other commands use the same hotkey as one of ours.
// Hotkeys match by their printed text, as in Obsidian's own Hotkeys tab. It only warns.
import { printHotkey, type PrintableHotkey } from './printer';

/** A registered command with the hotkeys the user set (if any) and its defaults. */
export interface CommandHotkeys {
	id: string;
	name: string;
	custom?: readonly PrintableHotkey[];
	defaults?: readonly PrintableHotkey[];
}

/** A command's effective hotkeys: the user's if they set any (even none), else its defaults. */
export function effectiveHotkeys(command: Pick<CommandHotkeys, 'custom' | 'defaults'>): readonly PrintableHotkey[] {
	return command.custom ?? command.defaults ?? [];
}

/**
 * Builds a lookup over every command's effective hotkeys. It returns the names of the other
 * commands that use `hotkey`, which is one of command `id`'s, sorted; empty if there is no conflict.
 */
export function conflictCheck(
	commands: readonly CommandHotkeys[],
	isMac: boolean,
): (id: string, hotkey: PrintableHotkey) => string[] {
	const users = new Map<string, { id: string; name: string }[]>();
	for (const command of commands) {
		for (const hotkey of effectiveHotkeys(command)) {
			const text = printHotkey(hotkey, isMac);
			users.set(text, [...(users.get(text) ?? []), command]);
		}
	}
	return (id, hotkey) => {
		const others = (users.get(printHotkey(hotkey, isMac)) ?? []).filter((c) => c.id !== id).map((c) => c.name);
		return [...new Set(others)].sort((a, b) => a.localeCompare(b));
	};
}
