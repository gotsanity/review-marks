import { lineChanges } from './line-diff';
import { lineOfOffset, lineStarts } from './parse';
import { codeLines, isHeadingLine } from './sections';
import type { AnnotationDoc, Change, Placement } from './types';

export interface MovePlan {
	/** Line-level replacements in offsets of `doc.text`; empty when the note is already in place. */
	changes: Change[];
	/** Definitions with a marker, all of which now sit at `placement`. */
	moved: number;
	/** Review definitions with no marker (or a second definition of an ID), left where they were. */
	orphans: number;
}

interface Line {
	text: string;
	heading: boolean;
	/** Part of a review definition left in place. */
	reviewDef: boolean;
}

const REVIEW_DEFINITION_START = /^\[\^r\d+\]:/;
const isBlank = (l: Line | undefined) => l !== undefined && l.text.trim() === '';

/**
 * Plans moving every review definition that has a marker to the end of the note, or to the end of
 * the section its marker is in (before the next heading of any level). Definitions follow the
 * reading order of their markers. Comments move byte for byte; author footnotes, code and orphan
 * definitions stay where they are, and the gaps the definitions leave close up. Planning again on
 * the result changes nothing.
 */
export function planMoveComments(doc: AnnotationDoc, placement: Placement): MovePlan {
	const { text } = doc;
	const hadFinalBreak = text.endsWith('\n');
	const raw = (hadFinalBreak ? text.slice(0, -1) : text).split('\n');
	const starts = lineStarts(text);
	const inCode = codeLines(raw);
	const lineOf = (offset: number) => lineOfOffset(starts, offset);

	const movable = doc.annotations
		.filter((a) => a.definition && !inCode[lineOf(a.definition.from)])
		.sort((a, b) => a.close - b.close);
	const definitionStarts = raw.filter((l, i) => !inCode[i] && REVIEW_DEFINITION_START.test(l)).length;
	const orphans = definitionStarts - movable.length;

	const headingLines = raw.flatMap((l, i) => (!inCode[i] && isHeadingLine(l) ? [i] : []));
	const sectionOf = (offset: number) => headingLines.filter((h) => (starts[h] ?? 0) <= offset).length;

	// 1. Take the movable definitions out, whole lines, byte for byte.
	const removed = new Uint8Array(raw.length);
	const blocks = movable.map((a) => {
		const def = a.definition!;
		const first = lineOf(def.from);
		const last = lineOf(def.to);
		removed.fill(1, first, last + 1);
		return { section: sectionOf(a.close), lines: raw.slice(first, last + 1) };
	});
	const reviewDef = new Uint8Array(raw.length);
	for (const d of doc.orphanDefinitions) reviewDef.fill(1, lineOf(d.from), lineOf(d.to) + 1);
	const lines: Line[] = raw.map((t, i) => ({
		text: t,
		heading: headingLines.includes(i),
		reviewDef: reviewDef[i] === 1,
	}));

	// 2. Close the gaps: a run of removed and blank lines becomes the first of its blank lines if
	//    there is content on both sides, and nothing otherwise.
	const kept: Line[] = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		if (!removed[i] && !isBlank(line)) {
			kept.push(line);
			continue;
		}
		let end = i;
		while (end + 1 < lines.length && (removed[end + 1] || isBlank(lines[end + 1]))) end++;
		const run = lines.slice(i, end + 1);
		if (!run.some((_, j) => removed[i + j])) {
			kept.push(...run);
		} else {
			const blank = run.find((l, j) => !removed[i + j] && isBlank(l));
			if (kept.length > 0 && end + 1 < lines.length && blank) kept.push(blank);
		}
		i = end;
	}

	// 3. Put them back after the last non-blank line of the note, or of each section.
	const insert = (from: number, to: number, defs: string[], beforeHeading: boolean) => {
		let last = to - 1;
		while (last >= from && isBlank(kept[last])) last--;
		const gap = to - (last + 1);
		const attach = last < 0 || kept[last]?.reviewDef;
		const add = [
			...(attach ? [] : ['']),
			...defs,
			...(beforeHeading && gap === 0 ? [''] : []),
		].map((t) => ({ text: t, heading: false, reviewDef: true }));
		kept.splice(last + 1, 0, ...add);
	};
	if (placement === 'end-of-note') {
		if (blocks.length > 0) insert(0, kept.length, blocks.flatMap((b) => b.lines), false);
	} else {
		const headingsKept = kept.flatMap((l, i) => (l.heading ? [i] : []));
		const bounds = [0, ...headingsKept, kept.length];
		for (let k = headingsKept.length; k >= 0; k--) {
			const defs = blocks.filter((b) => b.section === k).flatMap((b) => b.lines);
			if (defs.length > 0) insert(bounds[k]!, bounds[k + 1]!, defs, k < headingsKept.length);
		}
	}

	const out = kept.map((l) => l.text).join('\n') + (hadFinalBreak ? '\n' : '');
	return { changes: lineChanges(text, out), moved: movable.length, orphans };
}
