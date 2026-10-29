// THROWAWAY PROTOTYPE for issue #6 (storage format). Variant C: ==target==%%instruction%%
// No tests, no error handling, no abstractions. Do not build on this.
import {
	App,
	Editor,
	MarkdownPostProcessorContext,
	Modal,
	Notice,
	Plugin,
	TFile,
	editorLivePreviewField,
	setIcon,
} from "obsidian";
import { EditorState, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";

// ---------- parsing ----------

// Obsidian 1.14 colour emoji (copied from app.js: circles and squares both map to a colour).
const COLORS: Record<string, string> = {
	"🔴": "red", "🟥": "red", "🟠": "orange", "🟧": "orange", "🟡": "yellow", "🟨": "yellow",
	"🟢": "green", "🟩": "green", "🔵": "blue", "🟦": "blue", "🟣": "purple", "🟪": "purple",
};

interface Hl {
	from: number; // start of opening ==
	to: number; // end of closing == (plain) or closing %% (annotated)
	targetFrom: number; // after the opening == and any colour emoji
	targetTo: number; // start of closing ==
	color: string;
	annotated: boolean;
	instrFrom: number;
	instrTo: number;
	target: string;
	instruction: string;
}

// Blank out code, HTML comments and frontmatter so ==/%% inside them are ignored. Keeps offsets.
function mask(text: string): string {
	const blank = (m: string) => m.replace(/[^\n]/g, " ");
	return text
		.replace(/^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/, blank)
		.replace(/^([ \t]*)(```|~~~)[\s\S]*?^\1\2[^\n]*$/gm, blank)
		.replace(/`[^`\n]+`/g, blank)
		.replace(/<!--[\s\S]*?-->/g, blank);
}

// Every ==highlight== in order (plain and annotated), roughly following Obsidian's own rules:
// no whitespace right after the opening ==, none right before the closing ==, no blank line inside.
function parseHighlights(text: string, base = 0): Hl[] {
	const m = mask(text);
	const out: Hl[] = [];
	const re = /==(?!=)((?:(?!==)[\s\S])+?)==/g;
	let r: RegExpExecArray | null;
	while ((r = re.exec(m))) {
		const inner = r[1];
		const lineStart = m.lastIndexOf("\n", r.index) + 1;
		const inTable = /^\s*\|/.test(m.slice(lineStart, r.index + 1));
		if (
			/^\s/.test(inner) || /\s$/.test(inner) ||
			/\n[ \t\r]*\n/.test(inner) || // blank line = new block
			/\n[ \t]*([-*+] |\d+[.)] |#|>|\|)/.test(inner) || // new list item / heading / quote / table row
			(inTable && /(^|[^\\])\|/.test(inner)) // crosses a table cell
		) {
			re.lastIndex = r.index + 2;
			continue;
		}
		const from = r.index;
		const targetTo = from + 2 + inner.length;
		const cp = String.fromCodePoint(inner.codePointAt(0)!);
		const color = COLORS[cp] ?? "";
		const targetFrom = from + 2 + (color ? cp.length : 0);
		let end = targetTo + 2;
		const h: Hl = {
			from: base + from, to: base + end, targetFrom: base + targetFrom, targetTo: base + targetTo,
			color, annotated: false, instrFrom: -1, instrTo: -1,
			target: text.slice(targetFrom, targetTo), instruction: "",
		};
		// The Annotation rule: a %% comment must start IMMEDIATELY after the closing ==.
		if (m.startsWith("%%", end)) {
			const close = m.indexOf("%%", end + 2);
			if (close >= 0 && !/\n[ \t\r]*\n/.test(m.slice(end + 2, close))) {
				h.annotated = true;
				h.instrFrom = base + end + 2;
				h.instrTo = base + close;
				h.instruction = text.slice(end + 2, close);
				h.to = base + close + 2;
				re.lastIndex = close + 2;
			}
		}
		out.push(h);
	}
	return out;
}

const parseAnnotations = (text: string) => parseHighlights(text).filter((h) => h.annotated);

// Frontmatter gate: only act on notes with `review-format: C`.
function isGated(text: string): boolean {
	const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	return !!fm && /^review-format:\s*["']?C["']?\s*$/m.test(fm[1]);
}

// ---------- popover (shared by Live Preview and Reading view) ----------

let popEl: HTMLElement | null = null;
let popAnchor: HTMLElement | null = null;
let popPinned = false;

function showPopover(anchor: HTMLElement, instruction: string, pin = false) {
	hidePopover(true);
	popAnchor = anchor;
	popPinned = pin;
	popEl = document.body.createDiv({ cls: "pfc-popover" });
	popEl.createDiv({ cls: "pfc-popover-label", text: "Instruction" });
	popEl.createDiv({ cls: "pfc-popover-body", text: instruction });
	const r = anchor.getBoundingClientRect();
	const left = Math.max(8, Math.min(r.left, window.innerWidth - 380));
	popEl.setCssProps({ "--pfc-top": `${r.bottom + 6}px`, "--pfc-left": `${left}px` });
}

function hidePopover(force = false) {
	if (popPinned && !force) return;
	popEl?.remove();
	popEl = null;
	popAnchor = null;
	popPinned = false;
}

function togglePinned(anchor: HTMLElement, instruction: string) {
	if (popEl && popAnchor === anchor && popPinned) hidePopover(true);
	else showPopover(anchor, instruction, true);
}

function wireHover(el: HTMLElement, instruction: string) {
	el.addEventListener("mouseenter", () => { if (!popPinned) showPopover(el, instruction); });
	el.addEventListener("mouseleave", () => hidePopover());
	el.addEventListener("click", (e) => {
		e.preventDefault();
		e.stopPropagation();
		togglePinned(el, instruction);
	});
}

function makeIndicator(instruction: string): HTMLElement {
	const s = createSpan({ cls: "pfc-indicator", attr: { "aria-label": "Instruction" } });
	setIcon(s, "message-square");
	wireHover(s, instruction);
	return s;
}

// ---------- Live Preview (CM6) ----------

class IndicatorWidget extends WidgetType {
	constructor(readonly instruction: string, readonly pos: number) { super(); }
	eq(o: IndicatorWidget) { return o.instruction === this.instruction && o.pos === this.pos; }
	toDOM() { return makeIndicator(this.instruction); }
	ignoreEvent() { return true; } // clicks open the popover; they must not move the cursor into the syntax
}

const annField = StateField.define<Hl[]>({
	create: (s) => (isGated(s.doc.toString()) ? parseAnnotations(s.doc.toString()) : []),
	update: (v, tr) => {
		if (!tr.docChanged) return v;
		const t = tr.state.doc.toString();
		return isGated(t) ? parseAnnotations(t) : [];
	},
});

function buildDecos(s: EditorState): DecorationSet {
	if (!s.field(editorLivePreviewField, false)) return Decoration.none;
	const decos = [];
	for (const a of s.field(annField)) {
		const touched = s.selection.ranges.some((r) => r.from <= a.to && r.to >= a.from);
		decos.push(Decoration.mark({ class: "pfc-target" }).range(a.targetFrom, a.targetTo));
		if (touched) {
			// cursor inside: show the raw syntax, just tint the Instruction
			if (a.instrTo > a.instrFrom) decos.push(Decoration.mark({ class: "pfc-instr-raw" }).range(a.instrFrom, a.instrTo));
		} else {
			decos.push(Decoration.replace({}).range(a.from, a.from + 2));
			// hides `==%%instruction%%` (may cross a line break, hence a StateField, not a ViewPlugin)
			decos.push(Decoration.replace({ widget: new IndicatorWidget(a.instruction, a.from) }).range(a.targetTo, a.to));
		}
	}
	return Decoration.set(decos, true);
}

const decoField = StateField.define<DecorationSet>({
	create: buildDecos,
	update: (v, tr) => {
		const lpChanged = tr.startState.field(editorLivePreviewField, false) !== tr.state.field(editorLivePreviewField, false);
		if (tr.docChanged || tr.selection || lpChanged) return buildDecos(tr.state);
		return v;
	},
	provide: (f) => EditorView.decorations.from(f),
});

// hovering the Target itself (not just the indicator) also shows the popover
const targetHover = EditorView.domEventHandlers({
	mouseover(e, view) {
		const el = (e.target as HTMLElement).closest?.(".pfc-target") as HTMLElement | null;
		if (!el || popPinned) return;
		const pos = view.posAtDOM(el);
		const a = view.state.field(annField).find((x) => pos >= x.targetFrom && pos <= x.targetTo);
		if (a) showPopover(el, a.instruction);
	},
	mouseout(e) {
		if ((e.target as HTMLElement).closest?.(".pfc-target")) hidePopover();
	},
});

// Live Preview renders tables as a widget (.cm-table-widget) whose cells are plain rendered HTML:
// our decorations don't reach in, markdown post-processors are not run there, and the native comment
// is already stripped. So scan those widgets after each update and match <mark>s by text.
const tableWidgetScan = ViewPlugin.fromClass(
	class {
		constructor(view: EditorView) { this.scan(view); }
		update(u: ViewUpdate) { window.requestAnimationFrame(() => this.scan(u.view)); }
		scan(view: EditorView) {
			const anns = view.state.field(annField);
			if (!anns.length || !view.state.field(editorLivePreviewField, false)) return;
			view.dom.querySelectorAll(".cm-table-widget mark:not(.pfc-target)").forEach((mk) => {
				const a = anns.find((x) => norm(x.target) === norm(mk.textContent ?? ""));
				if (a) decorateMark(mk as HTMLElement, a);
			});
		}
	},
);

// ---------- Reading view ----------

// Rough "rendered text" of a Target, for matching against <mark>.textContent.
const norm = (s: string) => s
	.replace(/\[\[[^\]|]*?\\?\|([^\]]*)\]\]/g, "$1") // [[page\|alias]] -> alias
	.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // [text](url) -> text
	.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();

function decorateMark(mark: HTMLElement, a: Hl) {
	mark.addClass("pfc-target");
	wireHover(mark, a.instruction);
	// Obsidian's inline comment rule is /^%%(.*?)%%/ with no `s` flag, so a multi-line comment is NOT
	// hidden in Reading view: it leaks as raw `%%...%%` text. Remove that leaked text here.
	let n = mark.nextSibling;
	if (n && n.nodeType === Node.TEXT_NODE && n.textContent!.startsWith("%%")) {
		const t = n.textContent!;
		const close = t.indexOf("%%", 2);
		if (close >= 0) {
			n.textContent = t.slice(close + 2);
		} else {
			// runs across <br> etc.: delete siblings until the closing %%
			const first = n;
			n = n.nextSibling;
			first.remove();
			while (n) {
				const next = n.nextSibling;
				const txt = n.textContent ?? "";
				const c = n.nodeType === Node.TEXT_NODE ? txt.indexOf("%%") : -1;
				if (c >= 0) { n.textContent = txt.slice(c + 2); break; }
				n.remove();
				n = next;
			}
		}
		mark.addClass("pfc-leak-cleaned");
	}
	mark.after(makeIndicator(a.instruction));
}

async function postProcess(app: App, el: HTMLElement, ctx: MarkdownPostProcessorContext) {
	if (ctx.frontmatter?.["review-format"] !== "C") return;
	const marks = Array.from(el.querySelectorAll("mark")) as HTMLElement[];
	if (!marks.length) return;
	const info = ctx.getSectionInfo(el);
	if (info) {
		// Comments are stripped from the HTML, so read the section's SOURCE and pair each <mark>
		// with the next ==highlight== in that source whose text matches (order + text, so one
		// highlight our parser and Obsidian disagree on doesn't shift every later pairing).
		const lines = info.text.split("\n").slice(info.lineStart, info.lineEnd + 1);
		const hls = parseHighlights(lines.join("\n"));
		let j = 0;
		for (const mk of marks) {
			const k = hls.findIndex((h, i) => i >= j && norm(h.target) === norm(mk.textContent ?? ""));
			if (k < 0) continue;
			j = k + 1;
			if (hls[k].annotated) decorateMark(mk, hls[k]);
		}
		return;
	}
	// No section info (embeds, hover previews, export): read the file and match by text.
	const f = app.vault.getAbstractFileByPath(ctx.sourcePath);
	if (!(f instanceof TFile)) return;
	const anns = parseAnnotations(await app.vault.cachedRead(f));
	for (const mk of marks) {
		const a = anns.find((x) => norm(x.target) === norm(mk.textContent ?? ""));
		if (a) decorateMark(mk, a);
	}
}

// ---------- modal + commands ----------

class InstructionModal extends Modal {
	constructor(app: App, readonly initial: string, readonly onSave: (v: string) => void) { super(app); }
	onOpen() {
		this.titleEl.setText("Instruction (prototype C)");
		const ta = this.contentEl.createEl("textarea", { cls: "pfc-modal-textarea" });
		ta.value = this.initial;
		const save = () => { this.onSave(ta.value.trim()); this.close(); };
		ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } });
		const row = this.contentEl.createDiv({ cls: "pfc-modal-buttons" });
		row.createEl("button", { text: "Save (Ctrl+Enter)", cls: "mod-cta" }).addEventListener("click", save);
		window.setTimeout(() => ta.focus(), 0);
	}
	onClose() { this.contentEl.empty(); }
}

// Makes an Instruction safe for this format. Returns null if it cannot be stored.
function sanitize(instr: string, line: string): string | null {
	if (!instr) return null;
	if (instr.includes("%%")) { new Notice("Format C: an Instruction cannot contain %% (it would close the comment)."); return null; }
	if (instr.includes("\n")) {
		if (/^\s*(\||#)/.test(line)) {
			new Notice("Format C: newlines removed. They would break this table row or heading.");
			return instr.replace(/\s*\n\s*/g, " ");
		}
		new Notice("Format C: multi-line Instruction written. Without this plugin, Reading view shows it as raw %%...%% text.");
		// a line starting with a block marker would split the paragraph
		return instr.replace(/\n\s*(?=[-*+>#]|\d+[.)])/g, "\n ");
	}
	return instr;
}

export default class ProtoFormatC extends Plugin {
	async onload() {
		this.registerEditorExtension([annField, decoField, targetHover, tableWidgetScan]);
		this.registerMarkdownPostProcessor((el, ctx) => postProcess(this.app, el, ctx));
		this.registerDomEvent(document, "click", (e) => {
			const t = e.target as HTMLElement;
			if (popEl && !popEl.contains(t) && !t.closest(".pfc-indicator, .pfc-target")) hidePopover(true);
		});
		this.register(() => hidePopover(true));

		this.addCommand({
			id: "annotate-selection",
			name: "Prototype: annotate selection",
			editorCallback: (editor: Editor) => {
				if (!isGated(editor.getValue())) return new Notice("Not a review-format: C note.");
				let from = editor.posToOffset(editor.getCursor("from"));
				let to = editor.posToOffset(editor.getCursor("to"));
				const doc = editor.getValue();
				// trim whitespace: Obsidian ignores `== x==` / `==x ==`
				while (from < to && /\s/.test(doc[from])) from++;
				while (to > from && /\s/.test(doc[to - 1])) to--;
				const sel = doc.slice(from, to);
				if (!sel) return new Notice("Select the Target first.");
				if (sel.includes("\n")) return new Notice("Format C: a Target cannot cross a line or block (==...== is inline only). Annotate each block separately.");
				if (sel.includes("==") || sel.includes("%%")) return new Notice("Format C: the Target already contains == or %%; nesting is not possible.");
				if (parseHighlights(doc).some((h) => from < h.to && to > h.from)) return new Notice("Format C: the selection overlaps an existing highlight or Annotation.");
				const line = editor.getLine(editor.offsetToPos(from).line);
				new InstructionModal(this.app, "", (v) => {
					const instr = sanitize(v, line);
					if (instr === null) return;
					editor.transaction({
						changes: [{ from: editor.offsetToPos(from), to: editor.offsetToPos(to), text: `==${sel}==%%${instr}%%` }],
					});
				}).open();
			},
		});

		this.addCommand({
			id: "edit-instruction",
			name: "Prototype: edit instruction at cursor",
			editorCallback: (editor: Editor) => {
				const doc = editor.getValue();
				if (!isGated(doc)) return new Notice("Not a review-format: C note.");
				const off = editor.posToOffset(editor.getCursor());
				const a = parseAnnotations(doc).find((x) => off >= x.from && off <= x.to);
				if (!a) return new Notice("No Annotation at the cursor.");
				const line = editor.getLine(editor.offsetToPos(a.from).line);
				new InstructionModal(this.app, a.instruction, (v) => {
					const instr = sanitize(v, line);
					if (instr === null) return;
					editor.transaction({
						changes: [{ from: editor.offsetToPos(a.instrFrom), to: editor.offsetToPos(a.instrTo), text: instr }],
					});
				}).open();
			},
		});
	}
}
