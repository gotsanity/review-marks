// Reading view: a post processor decorates each rendered section. Reading view renders lazily,
// a section at a time, so each call takes the whole note from the public `getSectionInfo`
// (never `previewMode.renderer.sections`), parses it once, and decorates only its own lines.
import { MarkdownView, TFile, type App, type MarkdownPostProcessorContext, type Plugin } from 'obsidian';
import type { RenderedSection } from '../drag/reading-target';
import {
	excerpt,
	footnoteListLabels,
	isReviewLabel,
	lineOfOffset,
	lineStarts,
	normalizeLineEndings,
	parse,
	type Annotation,
	type AnnotationDoc,
} from '../core';
import { badgeText } from '../live-preview/badge';
import type { CommentPopover } from '../popover/popover';
import { decorateRendered } from '../rendered/decorate';
import type { ReviewMarksSettings } from '../settings';

/** The last note parsed: every section of a note brings the same text. */
let cached: AnnotationDoc | null = null;
function parseCached(text: string): AnnotationDoc {
	if (cached?.text !== text) cached = parse(text);
	return cached;
}

/**
 * Per note, where each Annotation's braces sit (by line) and its Comment. Obsidian re-renders only
 * the sections whose text changed, so when an edit elsewhere changes how an untouched section
 * should look (a Comment edited at the end of the note, a Target's other end moved), the whole
 * view is re-rendered.
 */
const shapes = new Map<string, string>();
function shapeOf(doc: AnnotationDoc): string {
	const starts = lineStarts(doc.text);
	const line = (offset: number) => lineOfOffset(starts, offset);
	return doc.annotations.map((a) => `${a.id}:${line(a.open)}-${line(a.close)}:${a.definition?.comment ?? ''}`).join('\n');
}

/** Re-renders Reading view of every open note, or only of `path`. */
export function rerenderReadingViews(app: App, path?: string): void {
	app.workspace.iterateAllLeaves((leaf) => {
		const view = leaf.view;
		if (view instanceof MarkdownView && (path === undefined || view.file?.path === path)) view.previewMode.rerender(true);
	});
}

/**
 * Tags the items of Reading view's footnote list that hold review Comments, and hides them when
 * the setting is on. Each item keeps its number, so the author's footnotes keep Obsidian's
 * numbering. Fails open: if the list doesn't match the note, nothing is hidden.
 */
function decorateFootnoteList(el: HTMLElement, text: string, hide: boolean): void {
	for (const list of Array.from(el.querySelectorAll('section.footnotes'))) {
		const items = Array.from(list.querySelectorAll(':scope > ol > li'));
		const labels = footnoteListLabels(text, items.length);
		if (!labels) continue;
		// Obsidian's item ids are `fn-<number>-<hash>`; any other numbering means we misread the list.
		if (!items.every((li, i) => li.id.startsWith(`fn-${i + 1}-`))) continue;
		let hidden = 0;
		items.forEach((li, i) => {
			const label = labels[i] ?? '';
			li.setAttribute('value', String(i + 1));
			if (!isReviewLabel(label)) return;
			li.classList.add('rm-review-footnote');
			li.setAttribute('data-rm-id', label);
			if (hide) {
				li.classList.add('rm-hidden');
				hidden++;
			}
		});
		if (hidden === items.length) list.classList.add('rm-hidden');
	}
}

/** Decorates the section `el`, lines `lineStart..lineEnd` of the note `text`. */
function decorateSection(
	el: HTMLElement,
	text: string,
	lineStart: number,
	lineEnd: number,
	sourcePath: string,
	settings: ReviewMarksSettings,
	popover: CommentPopover,
): void {
	const doc = parseCached(normalizeLineEndings(text));
	if (!shapes.has(sourcePath)) shapes.set(sourcePath, shapeOf(doc));

	const starts = lineStarts(doc.text);
	const from = starts[lineStart] ?? doc.text.length;
	const next = starts[lineEnd + 1];
	const to = next === undefined ? doc.text.length : next - 1;
	const badge = (a: Annotation) =>
		settings.showBadge
			? createSpan({
					cls: 'rm-badge',
					text: badgeText(a.id, a.definition?.comment ?? null, false, (c) => excerpt(c, settings.excerptLength)),
					attr: { 'data-rm-id': a.id },
				})
			: null;
	const decorated = decorateRendered(el, doc.text, { from, to }, doc.annotations, badge);
	// After decorating: `decorateRendered` first clears any `rm-hidden` it finds in the section.
	decorateFootnoteList(el, doc.text, settings.hideReviewFootnotes);
	if (!decorated) return;
	popover.attach(el, (anchor) => {
		const id = anchor.getAttribute('data-rm-id');
		const annotation = doc.annotations.find((a) => a.id === id);
		if (!id || !annotation) return null;
		return { id, comment: annotation.definition?.comment ?? null, sourcePath };
	});
}

/** Each rendered section's post-processor context, so its lines can be asked for later. */
const sectionContexts = new WeakMap<HTMLElement, MarkdownPostProcessorContext>();

/**
 * The rendered sections under `root` (a Reading view), in document order, with their current
 * source lines from `getSectionInfo`. Sections that no longer have section info are left out.
 */
export function renderedSections(root: HTMLElement): RenderedSection[] {
	const out: RenderedSection[] = [];
	const walk = (parent: Element) => {
		for (const child of Array.from(parent.children)) {
			const ctx = child.instanceOf(HTMLElement) ? sectionContexts.get(child) : undefined;
			if (!ctx) {
				walk(child);
				continue;
			}
			const info = ctx.getSectionInfo(child as HTMLElement);
			if (info) out.push({ el: child as HTMLElement, lineStart: info.lineStart, lineEnd: info.lineEnd });
		}
	};
	walk(root);
	return out;
}

export function registerReadingView(plugin: Plugin, settings: () => ReviewMarksSettings, popover: CommentPopover): void {
	const { vault } = plugin.app;
	plugin.registerMarkdownPostProcessor(async (el, ctx) => {
		// No section info means an embed, a hover preview or an export (src/export cleans exports).
		const info = ctx.getSectionInfo(el);
		if (!info) return;
		sectionContexts.set(el, ctx);
		// During `rerender(true)` the section info has its lines but an empty text: read the note.
		let text = info.text;
		if (text === '') {
			const file = vault.getAbstractFileByPath(ctx.sourcePath);
			if (!(file instanceof TFile)) return;
			text = await vault.cachedRead(file);
		}
		decorateSection(el, text, info.lineStart, info.lineEnd, ctx.sourcePath, settings(), popover);
	});
	plugin.registerEvent(
		vault.on('modify', async (file) => {
			if (!(file instanceof TFile) || file.extension !== 'md' || !shapes.has(file.path)) return;
			const shape = shapeOf(parseCached(normalizeLineEndings(await vault.cachedRead(file))));
			if (shapes.get(file.path) === shape) return;
			shapes.set(file.path, shape);
			rerenderReadingViews(plugin.app, file.path);
		}),
	);
	plugin.register(() => {
		shapes.clear();
		cached = null;
	});
}
