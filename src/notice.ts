import { Notice } from 'obsidian';

/** Shows a Notice as "Review Marks: <message>". Messages start lower case and end with a full stop. */
export function notify(message: string): void {
	new Notice(`Review Marks: ${message}`);
}
