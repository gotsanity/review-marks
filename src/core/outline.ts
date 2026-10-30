// The sidebar's model of a note: its Annotations grouped by heading section, with Target excerpts.
import { lineStarts } from './parse';
import { blockPrefixLength, codeLines, isHeadingLine } from './sections';
import type { Annotation, AnnotationDoc } from './types';

/** One Annotation as the sidebar lists it. */
export interface OutlineEntry {
	id: string;
	/** The Target as one line of text (see `targetExcerpt`), or null for a definition with no marker. */
	target: string | null;
	comment: string;
}

/** A heading section with the Annotations whose Target starts in it, and its sub-sections. */
export interface OutlineGroup {
	title: string;
	/** Heading level; 0 for the part of the note before the first heading. */
	level: number;
	/** Annotations in this section and all its sub-sections. */
	total: number;
	entries: OutlineEntry[];
	children: OutlineGroup[];
}

export interface Outline {
	/** Annotations with a Target. */
	count: number;
	/** Sections holding an Annotation, nested by heading level. */
	groups: OutlineGroup[];
	/** Definitions whose marker is missing. */
	untargeted: OutlineEntry[];
}

const TARGET_EXCERPT = 80;

/** Removes Annotation syntax: `}[^rN]` markers and the remaining braces. */
function stripSyntax(s: string): string {
	return s.replace(/\}\[\^r\d+\]/g, '').replace(/(?<!\\)[{}]/g, '');
}

/**
 * The Target as one line of plain text, about 80 characters: blocks joined with " / ", block
 * markers, table pipes, nested Annotation syntax and emphasis dropped, links shown by their text.
 */
export function targetExcerpt(text: string, a: Annotation, length = TARGET_EXCERPT): string {
	const flat = stripSyntax(
		text
			.slice(a.open + 1, a.close)
			.split('\n')
			.map((l, i) => (i === 0 ? l : l.slice(blockPrefixLength(l))).replace(/^\|\s*|\s*\|$/g, '').trim())
			.filter((l) => l !== '')
			.join(' / '),
	)
		.replace(/\[\[([^\]|]*?)(?:\\?\|([^\]]*))?\]\]/g, (_m, page: string, alias?: string) => alias ?? page)
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\*\*|__|==|~~|[*`]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return flat.length > length ? flat.slice(0, length).trimEnd() + '…' : flat;
}

function headingTitle(line: string): string {
	return (
		stripSyntax(line)
			.replace(/^#{1,6}\s*/, '')
			.replace(/\s+#+\s*$/, '')
			.replace(/^#+\s*$/, '')
			.trim() || '(untitled heading)'
	);
}

/** The Annotations of a note, grouped by the heading section their Target starts in. */
export function outline(doc: AnnotationDoc, noteName: string): Outline {
	const { text } = doc;
	const lines = text.split('\n');
	const starts = lineStarts(text);
	const inCode = codeLines(lines);
	const headings: { from: number; group: OutlineGroup }[] = [];
	lines.forEach((line, i) => {
		if (inCode[i] || !isHeadingLine(line)) return;
		const level = /^#+/.exec(line)?.[0].length ?? 1;
		headings.push({ from: starts[i] ?? 0, group: { title: headingTitle(line), level, total: 0, entries: [], children: [] } });
	});

	const top: OutlineGroup = { title: noteName, level: 0, total: 0, entries: [], children: [] };
	for (const a of doc.annotations) {
		let group = top;
		for (const h of headings) {
			if (h.from > a.open) break;
			group = h.group;
		}
		group.entries.push({ id: a.id, target: targetExcerpt(text, a), comment: a.definition?.comment ?? '' });
	}

	// Nest by level: a heading's parent is the nearest earlier heading of a lower level.
	const roots: OutlineGroup[] = [top];
	const stack: OutlineGroup[] = [];
	for (const { group } of headings) {
		while (stack.length && (stack[stack.length - 1] as OutlineGroup).level >= group.level) stack.pop();
		(stack.length ? (stack[stack.length - 1] as OutlineGroup).children : roots).push(group);
		stack.push(group);
	}
	const prune = (groups: OutlineGroup[]): OutlineGroup[] =>
		groups.filter((g) => {
			g.children = prune(g.children);
			g.total = g.entries.length + g.children.reduce((n, c) => n + c.total, 0);
			return g.total > 0;
		});

	return {
		count: doc.annotations.length,
		groups: prune(roots),
		untargeted: doc.orphanDefinitions.map((d) => ({ id: d.id, target: null, comment: d.comment })),
	};
}
