import { WidgetType } from '@codemirror/view';

/** The pill after a Target that shows the start of its Comment. */
export class BadgeWidget extends WidgetType {
	constructor(
		readonly id: string,
		readonly text: string,
	) {
		super();
	}

	eq(other: BadgeWidget): boolean {
		return other.id === this.id && other.text === this.text;
	}

	toDOM(): HTMLElement {
		return createSpan({ cls: 'rm-badge', text: this.text, attr: { 'data-rm-id': this.id } });
	}

	ignoreEvent(): boolean {
		return true;
	}
}

/** What the badge says: the excerpt, "…" while a new Comment is typed, or the marker if the definition is missing. */
export function badgeText(id: string, comment: string | null, typing: boolean, excerptOf: (c: string) => string): string {
	if (typing) return '…';
	if (comment === null) return `[^${id}]?`;
	return excerptOf(comment);
}
