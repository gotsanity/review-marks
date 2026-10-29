// PROTOTYPE (throwaway). Storage format A, "Inline": {target}(instruction).
// No tests, no error handling beyond what makes it run, no abstractions.
//
// Escape rules invented for this format:
// - Target: a literal { or } inside a Target is written \{ or \}.
// - Instruction ends at the first unescaped ")" at paren depth 0. Balanced ( ) pairs need
//   no escaping. Unbalanced parens are written \( or \).
// - [ ] | and \ in an Instruction are always backslash-escaped, so [[links]] don't become
//   real wikilinks and | doesn't split a table cell. These are CommonMark escapes, so the
//   note renders cleanly without the plugin.
// - A newline in an Instruction is stored as <br>. Instructions never contain a raw newline.
// - A Target may span lines (e.g. two list items) but not a blank line.

import { App, Editor, Modal, Notice, Plugin } from "obsidian";
import { editorLivePreviewField } from "obsidian";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";

interface Ann {
	from: number; // index of {
	tEnd: number; // index of }
	iStart: number; // first char of instruction (after "}(")
	iEnd: number; // index of closing )
	to: number; // iEnd + 1
	instruction: string; // decoded
}

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
function isFormatA(text: string): boolean {
	const m = FM_RE.exec(text);
	return !!m && /^review-format:\s*["']?A["']?\s*$/m.test(m[1]);
}

// ---------- parse / encode ----------

// rendered=true: parse text already rendered to HTML (no backslash escapes left, <br> already "\n").
export function parse(text: string, rendered = false): Ann[] {
	const out: Ann[] = [];
	const n = text.length;
	let i = 0;
	if (!rendered) {
		const fm = FM_RE.exec(text);
		if (fm) i = fm[0].length;
	}
	let inFence = false;
	while (i < n) {
		const c = text[i];
		// skip fenced code (line-start ```), source only
		if (!rendered && (i === 0 || text[i - 1] === "\n") && text.startsWith("```", i)) {
			inFence = !inFence;
			const nl = text.indexOf("\n", i);
			i = nl < 0 ? n : nl + 1;
			continue;
		}
		if (inFence) {
			const nl = text.indexOf("\n", i);
			i = nl < 0 ? n : nl + 1;
			continue;
		}
		if (c === "\\" && !rendered) { i += 2; continue; }
		if (c !== "{") { i++; continue; }

		// scan target
		let j = i + 1;
		let close = -1;
		let restart = -1;
		while (j < n) {
			const d = text[j];
			if (d === "\\" && !rendered) { j += 2; continue; }
			if (d === "{") { restart = j; break; }
			if (d === "\n") {
				let k = j + 1;
				while (k < n && (text[k] === " " || text[k] === "\t" || text[k] === "\r")) k++;
				if (k >= n || text[k] === "\n") break; // blank line ends the search
			}
			if (d === "}" && text[j + 1] === "(") { close = j; break; }
			j++;
		}
		if (close < 0) { i = restart > 0 ? restart : i + 1; continue; }

		// scan instruction: balanced parens, ends at depth-0 ")"
		let k = close + 2;
		let depth = 0;
		let end = -1;
		while (k < n) {
			const e = text[k];
			if (e === "\\" && !rendered) { k += 2; continue; }
			if (e === "\n" && !rendered) break;
			if (e === "(") depth++;
			else if (e === ")") {
				if (depth === 0) { end = k; break; }
				depth--;
			}
			k++;
		}
		if (end < 0) { i++; continue; }
		const raw = text.slice(close + 2, end);
		out.push({
			from: i, tEnd: close, iStart: close + 2, iEnd: end, to: end + 1,
			instruction: rendered ? raw : decodeInstruction(raw),
		});
		i = end + 1;
	}
	return out;
}

export function decodeInstruction(raw: string): string {
	return raw
		.replace(/<br\s*\/?>/gi, "\n")
		.replace(/\\([!-\/:-@\[-`{-~])/g, "$1");
}

export function encodeInstruction(s: string): string {
	s = s.replace(/\r\n?/g, "\n").trim();
	// find unbalanced parens
	const bad = new Set<number>();
	const stack: number[] = [];
	for (let i = 0; i < s.length; i++) {
		if (s[i] === "(") stack.push(i);
		else if (s[i] === ")") { if (stack.length) stack.pop(); else bad.add(i); }
	}
	for (const i of stack) bad.add(i);
	let out = "";
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === "\n") out += "<br>";
		else if (c === "\\" || c === "[" || c === "]" || c === "|") out += "\\" + c;
		else if (bad.has(i)) out += "\\" + c;
		else out += c;
	}
	return out;
}

export function encodeTarget(s: string): string {
	let out = "";
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === "\\") { out += c + (s[i + 1] ?? ""); i++; continue; }
		if (c === "{" || c === "}") out += "\\" + c;
		else out += c;
	}
	return out;
}

// ---------- popover (shared by both views) ----------

let pop: HTMLElement | null = null;
let hideTimer: number | null = null;
let pinned = false;

function showPopover(anchor: HTMLElement, text: string, pin: boolean) {
	if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; }
	if (!pop) {
		pop = document.body.createDiv({ cls: "pa-popover" });
		pop.addEventListener("mouseenter", () => { if (hideTimer) { window.clearTimeout(hideTimer); hideTimer = null; } });
		pop.addEventListener("mouseleave", () => scheduleHide());
	}
	pinned = pin || pinned;
	pop.empty();
	pop.createDiv({ cls: "pa-popover-label", text: "Instruction" });
	pop.createDiv({ cls: "pa-popover-body", text });
	const r = anchor.getBoundingClientRect();
	pop.style.setProperty("--pa-top", `${r.bottom + 6}px`);
	pop.style.setProperty("--pa-left", `${Math.max(8, Math.min(r.left, window.innerWidth - 340))}px`);
	pop.addClass("is-visible");
}

function scheduleHide() {
	if (pinned) return;
	if (hideTimer) window.clearTimeout(hideTimer);
	hideTimer = window.setTimeout(() => { pop?.removeClass("is-visible"); }, 250);
}

function hidePopover() {
	pinned = false;
	pop?.removeClass("is-visible");
}

function wireHover(el: HTMLElement, instruction: string) {
	el.addEventListener("mouseenter", () => showPopover(el, instruction, false));
	el.addEventListener("mouseleave", () => scheduleHide());
}

function makeIndicator(instruction: string): HTMLElement {
	const el = createSpan({ cls: "pa-indicator", text: "✎" });
	el.setAttr("aria-label", "Show instruction");
	wireHover(el, instruction);
	el.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		pinned = false;
		showPopover(el, instruction, true);
	});
	return el;
}

// ---------- Live Preview ----------

class IndicatorWidget extends WidgetType {
	constructor(readonly instruction: string, readonly pos: number) { super(); }
	eq(o: IndicatorWidget) { return o.instruction === this.instruction && o.pos === this.pos; }
	toDOM() { return makeIndicator(this.instruction); }
	ignoreEvent() { return true; }
}

function buildDecorations(view: EditorView): DecorationSet {
	if (!view.state.field(editorLivePreviewField, false)) return Decoration.none;
	const text = view.state.doc.toString();
	if (!isFormatA(text)) return Decoration.none;
	const anns = parse(text);
	const ranges = view.state.selection.ranges;
	const b = new RangeSetBuilder<Decoration>();
	for (const a of anns) {
		const active = ranges.some((r) => r.from <= a.to && r.to >= a.from);
		const target = Decoration.mark({ class: "pa-target", attributes: { "data-pa-instr": a.instruction } });
		if (active) {
			b.add(a.from, a.from + 1, Decoration.mark({ class: "pa-delim" }));
			if (a.tEnd > a.from + 1) b.add(a.from + 1, a.tEnd, target);
			b.add(a.tEnd, a.to, Decoration.mark({ class: "pa-raw-instruction" }));
		} else {
			b.add(a.from, a.from + 1, Decoration.replace({}));
			if (a.tEnd > a.from + 1) b.add(a.from + 1, a.tEnd, target);
			b.add(a.tEnd, a.to, Decoration.replace({ widget: new IndicatorWidget(a.instruction, a.from) }));
		}
	}
	return b.finish();
}

const livePreview = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;
		constructor(view: EditorView) { this.decorations = buildDecorations(view); }
		update(u: ViewUpdate) {
			const lpChanged = u.startState.field(editorLivePreviewField, false) !== u.state.field(editorLivePreviewField, false);
			if (u.docChanged || u.selectionSet || u.viewportChanged || lpChanged) this.decorations = buildDecorations(u.view);
		}
	},
	{
		decorations: (v) => v.decorations,
		eventHandlers: {
			mouseover(e: MouseEvent) {
				const t = (e.target as HTMLElement).closest?.(".pa-target") as HTMLElement | null;
				const instr = t?.getAttribute("data-pa-instr");
				if (t && instr != null) showPopover(t, instr, false);
			},
			mouseout(e: MouseEvent) {
				if ((e.target as HTMLElement).closest?.(".pa-target")) scheduleHide();
			},
		},
	},
);

// ---------- Reading view ----------

interface Seg { node: Text | null; br: HTMLElement | null; start: number; len: number }

function textMap(el: HTMLElement): { text: string; segs: Seg[] } {
	const segs: Seg[] = [];
	let text = "";
	const walk = (n: Node) => {
		for (let c = n.firstChild; c; c = c.nextSibling) {
			if (c.nodeType === Node.TEXT_NODE) {
				const t = c as Text;
				segs.push({ node: t, br: null, start: text.length, len: t.data.length });
				text += t.data;
			} else if (c.nodeType === Node.ELEMENT_NODE) {
				const e = c as HTMLElement;
				if (e.tagName === "BR") { segs.push({ node: null, br: e, start: text.length, len: 1 }); text += "\n"; }
				else if (!e.hasClass("pa-indicator")) walk(e);
			}
		}
	};
	walk(el);
	return { text, segs };
}

function charAt(segs: Seg[], pos: number): { node: Text; off: number } | null {
	for (const s of segs) if (s.node && pos >= s.start && pos < s.start + s.len) return { node: s.node, off: pos - s.start };
	return null;
}

interface Match { open: number; close: number; end: number; instruction: string }

function findMatch(text: string, expected: string[] | null): Match | null {
	let best: Match | null = null;
	if (expected && expected.length) {
		for (const instr of expected) {
			const idx = text.indexOf("}(" + instr + ")");
			if (idx < 0) continue;
			const open = text.lastIndexOf("{", idx);
			if (open < 0) continue;
			if (!best || open < best.open) best = { open, close: idx, end: idx + 2 + instr.length + 1, instruction: instr };
		}
		if (best) return best;
	}
	const a = parse(text, true)[0];
	return a ? { open: a.from, close: a.tEnd, end: a.to, instruction: a.instruction } : null;
}

function processReading(el: HTMLElement, expected: string[] | null) {
	for (let guard = 0; guard < 50; guard++) {
		const { text, segs } = textMap(el);
		const m = findMatch(text, expected);
		if (!m) return;
		const o = charAt(segs, m.open), c = charAt(segs, m.close), e = charAt(segs, m.end - 1);
		if (!o || !c || !e) return;
		const rOpen = document.createRange();
		rOpen.setStart(o.node, o.off); rOpen.setEnd(o.node, o.off + 1);
		const rClose = document.createRange();
		rClose.setStart(c.node, c.off); rClose.setEnd(e.node, e.off + 1);

		// wrap each target text node piece (works across inline formatting and across list items)
		const pieces: { node: Text; s: number; e: number }[] = [];
		for (const s of segs) {
			if (!s.node) continue;
			const a = Math.max(s.start, m.open + 1), b = Math.min(s.start + s.len, m.close);
			if (a >= b) continue;
			if (!s.node.data.slice(a - s.start, b - s.start).trim()) continue;
			pieces.push({ node: s.node, s: a - s.start, e: b - s.start });
		}
		for (let i = pieces.length - 1; i >= 0; i--) {
			let { node } = pieces[i];
			const { s, e: en } = pieces[i];
			if (en < node.data.length) node.splitText(en);
			if (s > 0) node = node.splitText(s);
			const span = createSpan({ cls: "pa-target" });
			wireHover(span, m.instruction);
			span.addEventListener("click", () => { pinned = false; showPopover(span, m.instruction, true); });
			node.parentNode!.insertBefore(span, node);
			span.appendChild(node);
		}
		rClose.deleteContents();
		rClose.insertNode(makeIndicator(m.instruction));
		rOpen.deleteContents();
		if (expected) expected = expected.filter((x) => x !== m.instruction);
	}
}

// ---------- Modal ----------

class InstructionModal extends Modal {
	constructor(app: App, readonly initial: string, readonly onSubmit: (v: string) => void) { super(app); }
	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("pa-modal");
		contentEl.createEl("h3", { text: "Instruction (prototype A)" });
		const ta = contentEl.createEl("textarea", { cls: "pa-modal-input" });
		ta.value = this.initial;
		contentEl.createDiv({ cls: "pa-modal-hint", text: "Ctrl/Cmd+Enter to save. Newlines are stored as <br>." });
		const btn = contentEl.createEl("button", { text: "Save", cls: "mod-cta" });
		const submit = () => {
			const v = ta.value.trim();
			if (!v) { new Notice("Empty instruction."); return; }
			this.close();
			this.onSubmit(v);
		};
		btn.addEventListener("click", submit);
		ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
		window.setTimeout(() => ta.focus(), 0);
	}
	onClose() { this.contentEl.empty(); }
}

// ---------- plugin ----------

export default class ProtoFormatA extends Plugin {
	async onload() {
		this.registerEditorExtension(livePreview);

		this.registerMarkdownPostProcessor((el, ctx) => {
			const fm = ctx.frontmatter ?? this.app.metadataCache.getCache(ctx.sourcePath)?.frontmatter;
			if (!fm || String(fm["review-format"]) !== "A") return;
			let expected: string[] | null = null;
			const info = ctx.getSectionInfo(el);
			if (info) {
				const src = info.text.split("\n").slice(info.lineStart, info.lineEnd + 1).join("\n");
				expected = parse(src).map((a) => a.instruction);
			}
			processReading(el, expected);
		});

		this.registerDomEvent(document, "click", (e) => {
			const t = e.target as HTMLElement;
			if (!t.closest?.(".pa-popover") && !t.closest?.(".pa-indicator") && !t.closest?.(".pa-target")) hidePopover();
		});

		this.addCommand({
			id: "annotate-selection",
			name: "Prototype: annotate selection",
			editorCallback: (editor: Editor) => {
				const text = editor.getValue();
				if (!isFormatA(text)) { new Notice("Not a review-format: A note."); return; }
				const sel = editor.getSelection();
				if (!sel) { new Notice("Select a Target first."); return; }
				const from = editor.posToOffset(editor.getCursor("from"));
				const to = editor.posToOffset(editor.getCursor("to"));
				if (/\n[ \t\r]*\n/.test(sel)) { new Notice("Format A can't hold a Target that crosses a blank line."); return; }
				if (parse(text).some((a) => a.from < to && a.to > from)) { new Notice("Overlaps an existing Annotation; format A has no nesting."); return; }
				new InstructionModal(this.app, "", (instr) => {
					editor.transaction({
						changes: [{ from: editor.offsetToPos(from), to: editor.offsetToPos(to), text: `{${encodeTarget(sel)}}(${encodeInstruction(instr)})` }],
					});
				}).open();
			},
		});

		this.addCommand({
			id: "edit-instruction-at-cursor",
			name: "Prototype: edit instruction at cursor",
			editorCallback: (editor: Editor) => {
				const text = editor.getValue();
				if (!isFormatA(text)) { new Notice("Not a review-format: A note."); return; }
				const off = editor.posToOffset(editor.getCursor());
				const a = parse(text).find((x) => x.from <= off && off <= x.to);
				if (!a) { new Notice("No Annotation at cursor."); return; }
				new InstructionModal(this.app, a.instruction, (instr) => {
					editor.transaction({
						changes: [{ from: editor.offsetToPos(a.iStart), to: editor.offsetToPos(a.iEnd), text: encodeInstruction(instr) }],
					});
				}).open();
			},
		});
	}

	onunload() {
		pop?.remove();
		pop = null;
	}
}

