// PROTOTYPE (throwaway). Reading view: a post processor per rendered section.
// Reading view renders lazily, one section at a time, so each call re-reads the whole note
// (getSectionInfo gives the full text), parses it once (cached) and decorates its own part.
import { MarkdownPostProcessorContext, MarkdownView, Plugin, TFile } from 'obsidian';
import { REVIEW_ID, analyze, footnoteOrder, lineStarts, normalize } from './parse';
import { settings } from './settings';
import { makeBadge } from './ui';
import { decorateRendered } from './render-dom';

export function registerReading(plugin: Plugin) {
  plugin.registerMarkdownPostProcessor((el, ctx) => postProcess(plugin, el, ctx));

  // A Target that crosses blocks: editing one end changes how an untouched section should look,
  // and Obsidian only re-renders the sections whose text changed. Re-render when the spans move.
  plugin.registerEvent(plugin.app.vault.on('modify', async (f) => {
    if (!(f instanceof TFile) || f.extension !== 'md') return;
    const shape = shapeOf(normalize(await plugin.app.vault.cachedRead(f)));
    const old = shapes.get(f.path);
    shapes.set(f.path, shape);
    if (old !== undefined && old !== shape) rerenderPreviews(plugin, f.path);
  }));
}

// Per note: which lines each Annotation opens and closes on, plus its Comment.
const shapes = new Map<string, string>();
function shapeOf(text: string): string {
  const starts = lineStarts(text);
  const line = (o: number) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= o) lo = m; else hi = m - 1; } return lo; };
  return analyze(text).anns.map((a) => `${a.id}:${a.open < 0 ? -1 : line(a.open)}-${a.close < 0 ? -1 : line(a.close)}:${a.comment}`).join('|');
}

export function rerenderPreviews(plugin: Plugin, path?: string) {
  for (const leaf of plugin.app.workspace.getLeavesOfType('markdown')) {
    const v = leaf.view;
    if (v instanceof MarkdownView && (!path || v.file?.path === path)) v.previewMode.rerender(true);
  }
}

async function postProcess(plugin: Plugin, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
  const info = ctx.getSectionInfo(el);
  let text: string;
  if (info) text = normalize(info.text);
  else {
    const f = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
    if (!(f instanceof TFile)) return;
    text = normalize(await plugin.app.vault.cachedRead(f));
  }
  if (!shapes.has(ctx.sourcePath)) shapes.set(ctx.sourcePath, shapeOf(text));

  if (info) {
    const starts = lineStarts(text);
    const from = starts[info.lineStart] ?? text.length;
    const to = info.lineEnd + 1 < starts.length ? starts[info.lineEnd + 1] - 1 : text.length;
    decorateRendered(el, text, from, to, ctx.sourcePath);
  } else {
    // No source positions (embeds, hover previews, export): badge + hidden ref only.
    const { anns } = analyze(text);
    el.querySelectorAll('sup.footnote-ref').forEach((sup) => {
      const id = sup.querySelector('a[data-footref]')?.getAttribute('data-footref') ?? '';
      const a = anns.find((x) => x.id === id && x.open >= 0);
      if (!a || !(sup instanceof HTMLElement) || sup.hasClass('rm-hidden')) return;
      sup.addClass('rm-hidden');
      const prev = sup.previousSibling;
      if (prev instanceof Text && prev.data.endsWith('}')) prev.data = prev.data.slice(0, -1);
      if (settings.showBadge) sup.after(makeBadge(a, ctx.sourcePath));
    });
  }

  // The footnote list Obsidian builds at the end of the note. Items are numbered by first reference.
  el.querySelectorAll('section.footnotes').forEach((sec) => {
    const order = footnoteOrder(text);
    const items = Array.from(sec.querySelectorAll('li[id^="fn-"]'));
    let hidden = 0;
    for (const li of items) {
      const num = parseInt(/^fn-(\d+)/.exec(li.id)?.[1] ?? '0', 10);
      const label = order[num - 1] ?? '';
      if (li instanceof HTMLLIElement && num) li.value = num; // keep "3." next to a [3] ref when 1-2 are hidden
      if (!REVIEW_ID.test(label)) continue;
      li.addClass('rm-review-fn');
      li.setAttribute('data-rm-id', label);
      if (settings.hideReviewFootnotes) { li.addClass('rm-hidden'); hidden++; }
    }
    if (items.length && hidden === items.length) sec.addClass('rm-hidden');
  });
}
