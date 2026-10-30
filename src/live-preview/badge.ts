import { WidgetType } from '@codemirror/view';
import { createBadge } from '../badge';

/** The badge (see src/badge.ts) as a CodeMirror widget, replacing the `}[^rN]` marker. */
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
		return createBadge(this.id, this.text);
	}

	ignoreEvent(): boolean {
		return true;
	}
}
