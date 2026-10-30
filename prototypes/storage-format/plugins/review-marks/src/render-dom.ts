// PROTOTYPE (throwaway). Decorates already-rendered HTML for a known slice of the source:
// a Reading view section, or a table cell in Live Preview's table widget.
//
// How: Obsidian renders '{' and '}' as literal text, so the n-th brace in the source slice is the
// n-th brace character in the rendered text. Align them, then hide the braces and the footnote
// reference, wrap the text in between, and add the badge. Targets that start or end outside the
// slice cover it from its start or to its end, which is how a Target crossing blocks is drawn.
import { Annotation, analyze, renderedBraces } from './parse';
import { settings } from './settings';
import { makeBadge, wireTarget } from './ui';

const SKIP = 'code, pre, sup.footnote-ref, .rm-badge, .math, .cm-editor, .footnotes, .frontmatter, '
  + '.table-row-drag-handle, .table-col-drag-handle';

function skipped(n: Node, root: HTMLElement): boolean {
  for (let p = n.parentElement; p && p !== root; p = p.parentElement) if (p.matches(SKIP)) return true;
  return false;
}

interface Iv { s: number; e: number; kind: 'hide' | 'target'; ann: Annotation; close?: boolean }

/** Undo decorateRendered (so a cell can be decorated again after a settings change). */
export function undecorate(root: HTMLElement) {
  root.querySelectorAll('.rm-badge').forEach((b) => b.remove());
  root.querySelectorAll('sup.rm-hidden').forEach((s) => s.removeClass('rm-hidden'));
  root.querySelectorAll('span.rm-hidden, span.rm-target').forEach((s) => s.replaceWith(document.createTextNode(s.textContent ?? '')));
  root.normalize();
}

export function decorateRendered(root: HTMLElement, text: string, from: number, to: number, sourcePath: string): number {
  if (root.querySelector('.rm-hidden, .rm-target, .rm-badge')) undecorate(root);
  const { anns, ign } = analyze(text);
  const hits = anns.filter((a) => a.open >= 0 && a.open < to && a.refEnd > from);
  if (!hits.length) return 0;

  const nodes: Text[] = [];
  const braces: { ni: number; ci: number; ch: string }[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = w.nextNode())) {
    if (skipped(n, root)) continue;
    const t = n as Text;
    for (let i = 0; i < t.data.length; i++) {
      const c = t.data[i];
      if (c === '{' || c === '}') braces.push({ ni: nodes.length, ci: i, ch: c });
    }
    nodes.push(t);
  }
  if (!nodes.length) return 0;

  const src = renderedBraces(text, from, to, anns, ign);
  if (src.length !== braces.length) console.debug('[review-marks] brace count differs', { from, to, src: src.length, dom: braces.length });
  const at = new Map<number, { ni: number; ci: number }>();
  for (let k = 0; k < Math.min(src.length, braces.length); k++) {
    if (text[src[k]] !== braces[k].ch) break;
    at.set(src[k], braces[k]);
  }

  const ivs = new Map<number, Iv[]>();
  const add = (ni: number, iv: Iv) => { if (!ivs.has(ni)) ivs.set(ni, []); ivs.get(ni)!.push(iv); };
  const badges: { ann: Annotation; after: 'close' | HTMLElement }[] = [];
  let done = 0;

  for (const a of hits) {
    const o = a.open >= from ? at.get(a.open) : { ni: 0, ci: -1 };
    const c = a.close < to ? at.get(a.close) : { ni: nodes.length - 1, ci: nodes[nodes.length - 1].length };
    if (!o || !c) continue;
    if (a.open >= from) add(o.ni, { s: o.ci, e: o.ci + 1, kind: 'hide', ann: a });
    if (a.close < to) {
      const node = nodes[c.ni];
      const rest = node.data.slice(c.ci + 1);
      const ref = new RegExp('^(\\[\\^' + a.id + '\\]|' + a.id + '(?![0-9]))').exec(rest);
      add(c.ni, { s: c.ci, e: c.ci + 1 + (ref ? ref[0].length : 0), kind: 'hide', ann: a, close: true });
      const sib = !ref && c.ci + 1 === node.length ? node.nextSibling : null;
      if (sib instanceof HTMLElement && sib.tagName === 'SUP') {
        sib.addClass('rm-hidden');
        badges.push({ ann: a, after: sib });
      } else badges.push({ ann: a, after: 'close' });
    }
    for (let k = o.ni; k <= c.ni; k++) {
      const s = k === o.ni ? o.ci + 1 : 0;
      const e = k === c.ni ? c.ci : nodes[k].length;
      if (e > s && nodes[k].data.slice(s, e).trim() !== '') add(k, { s, e, kind: 'target', ann: a });
    }
    done++;
  }

  // Rewrite each touched text node once, so recorded offsets never go stale.
  for (const [ni, list] of ivs) {
    const node = nodes[ni];
    const cuts = new Set<number>([0, node.length]);
    for (const iv of list) { cuts.add(Math.max(0, iv.s)); cuts.add(Math.min(node.length, iv.e)); }
    const pts = [...cuts].sort((x, y) => x - y);
    const frag = document.createDocumentFragment();
    for (let i = 0; i + 1 < pts.length; i++) {
      const s = pts[i], e = pts[i + 1];
      const piece = node.data.slice(s, e);
      const cover = list.filter((iv) => iv.s <= s && iv.e >= e);
      const hide = cover.find((iv) => iv.kind === 'hide');
      const tgts = cover.filter((iv) => iv.kind === 'target').sort((x, y) => (x.ann.close - x.ann.open) - (y.ann.close - y.ann.open));
      if (hide) {
        const sp = createSpan({ cls: 'rm-hidden', text: piece });
        if (hide.close) sp.dataset.rmClose = hide.ann.id;
        frag.appendChild(sp);
      } else if (tgts.length) {
        const sp = createSpan({ cls: 'rm-target' + (tgts.length > 1 ? ' rm-nested' : ''), text: piece });
        sp.dataset.rmId = tgts[0].ann.id;
        wireTarget(sp, tgts[0].ann, sourcePath, false);
        frag.appendChild(sp);
      } else frag.appendChild(document.createTextNode(piece));
    }
    node.replaceWith(frag);
  }

  if (settings.showBadge) {
    for (const b of badges) {
      const after = b.after === 'close' ? root.querySelector(`[data-rm-close="${b.ann.id}"]`) : b.after;
      after?.after(makeBadge(b.ann, sourcePath));
    }
  }
  return done;
}
