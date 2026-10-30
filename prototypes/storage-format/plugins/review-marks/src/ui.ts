// PROTOTYPE (throwaway). Shared UI: comment popover, badge, target wiring.
import { App, Component, MarkdownRenderer, Platform } from 'obsidian';
import { Annotation, excerpt } from './parse';
import { settings } from './settings';

let app: App;
let owner: Component;
export function initUi(a: App, c: Component) { app = a; owner = c; }

// ---------- popover ----------

let pop: HTMLElement | null = null;
let popAnchor: HTMLElement | null = null;
let pinned = false;
let hideTimer: number | undefined;
let popComp: Component | null = null;

export function isPopoverPinned() { return pinned; }

export function showPopover(anchor: HTMLElement, a: Annotation, sourcePath: string, pin: boolean) {
  window.clearTimeout(hideTimer);
  if (pop && pinned && !pin) return;
  if (pop && pinned && pin && popAnchor === anchor) { hidePopover(true); return; }
  hidePopover(true);
  pinned = pin;
  popAnchor = anchor;
  pop = document.body.createDiv({ cls: 'rm-popover' });
  pop.createDiv({ cls: 'rm-popover-head', text: `Comment [^${a.id}]` });
  const body = pop.createDiv({ cls: 'rm-popover-body markdown-rendered' });
  popComp = new Component();
  owner.addChild(popComp);
  if (a.comment) void MarkdownRenderer.render(app, a.comment, body, sourcePath, popComp).then(() => place(anchor));
  else body.setText('(no definition found for this annotation)');
  pop.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
  pop.addEventListener('mouseleave', () => scheduleHide());
  place(anchor);
}

function place(anchor: HTMLElement) {
  if (!pop) return;
  const r = anchor.getBoundingClientRect();
  const below = r.bottom + 6 + pop.offsetHeight <= window.innerHeight;
  const top = below ? r.bottom + 6 : r.top - pop.offsetHeight - 6;
  const left = Math.max(4, Math.min(r.left, window.innerWidth - pop.offsetWidth - 4));
  pop.setCssProps({ '--rm-top': `${Math.max(4, top)}px`, '--rm-left': `${left}px` });
}

export function scheduleHide() {
  if (pinned) return;
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => hidePopover(false), 250);
}

export function hidePopover(force: boolean) {
  if (!pop || (pinned && !force)) return;
  pop.remove();
  if (popComp) owner.removeChild(popComp);
  pop = null; popComp = null; popAnchor = null; pinned = false;
}

export function popoverContains(n: Node) { return !!pop && pop.contains(n); }

// ---------- badge and target wiring ----------

/** Hover (desktop, if enabled) and tap (mobile, or the badge anywhere) open the popover. */
export function wireTarget(el: HTMLElement, a: Annotation, sourcePath: string, isBadge: boolean) {
  el.addEventListener('mouseenter', () => { if (settings.showHover && !Platform.isMobile) showPopover(el, a, sourcePath, false); });
  el.addEventListener('mouseleave', () => scheduleHide());
  if (isBadge || Platform.isMobile) {
    el.addEventListener('click', (e) => {
      if (!isBadge && !settings.showHover) return;
      e.preventDefault(); e.stopPropagation();
      showPopover(el, a, sourcePath, true);
    });
  }
}

/** The new Annotation whose Comment is being typed in the comment box ("path#id"); its badge shows "…". */
let pendingBadge = '';
export function setPendingBadge(path: string, id: string) { pendingBadge = id ? `${path}#${id}` : ''; }

export function makeBadge(a: Annotation, sourcePath: string): HTMLElement {
  const el = createSpan({ cls: 'rm-badge', attr: { 'data-rm-id': a.id, 'aria-label': 'Comment' } });
  const typing = !a.comment && pendingBadge === `${sourcePath}#${a.id}`;
  el.setText(a.comment ? excerpt(a.comment, settings.excerptLength) : typing ? '…' : `[^${a.id}]?`);
  wireTarget(el, a, sourcePath, true);
  return el;
}
