// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parse, type Annotation } from '../core';
import { block } from '../test-support/fake-dom';
import { decorateRendered, undecorate } from './decorate';

function badge(a: Annotation): HTMLElement {
	return createSpan({ cls: 'rm-badge', text: `comment ${a.id}` });
}

/** Decorates `html`, rendered from `slice` of `text`, and returns the root. */
function decorate(text: string, slice: string, html: string): { root: HTMLElement; done: boolean } {
	const root = block(html);
	const from = text.indexOf(slice);
	const done = decorateRendered(root, text, { from, to: from + slice.length }, parse(text).annotations, badge);
	return { root, done };
}

/** What the reader sees: text outside `.rm-hidden`, with `[…]` around highlighted text. */
function seen(root: HTMLElement): string {
	let out = '';
	const is = (n: Node, cls: string) => n.nodeType === Node.ELEMENT_NODE && (n as Element).classList.contains(cls);
	const walk = (n: Node) => {
		if (is(n, 'rm-hidden')) return;
		if (is(n, 'rm-target')) out += '[';
		if (is(n, 'rm-badge')) out += '<';
		if (n.nodeType === Node.TEXT_NODE) out += (n as Text).data;
		n.childNodes.forEach(walk);
		if (is(n, 'rm-target')) out += ']';
		if (is(n, 'rm-badge')) out += '>';
	};
	walk(root);
	return out;
}

const TABLE =
	'| Character | Result |\n|---|---|\n| Doreth Kell | {17 (fail)}[^r9] |\n' +
	'| {[[malas-vance\\|Malas Vance]] (the Peddler)}[^r8] | Patron |\n\n[^r8]: Use "Vance".\n[^r9]: DC 18?\n';

describe('decorateRendered: Live Preview table cells', () => {
	it('hides the syntax, highlights the Target and adds the badge (r9)', () => {
		const { root, done } = decorate(TABLE, '{17 (fail)}[^r9]', '{17 (fail)}r9');
		expect(done).toBe(true);
		expect(seen(root)).toBe('[17 (fail)]<comment r9>');
		expect(root.querySelector('.rm-target')?.getAttribute('data-rm-id')).toBe('r9');
	});

	it('highlights across a link with an escaped bar (r8)', () => {
		const { root } = decorate(
			TABLE,
			'{[[malas-vance\\|Malas Vance]] (the Peddler)}[^r8]',
			'{<a class="internal-link" href="malas-vance">Malas Vance</a> (the Peddler)}r8',
		);
		expect(seen(root)).toBe('[Malas Vance][ (the Peddler)]<comment r8>');
		expect(root.querySelector('a.internal-link')?.textContent).toBe('Malas Vance');
	});

	it('leaves a cell without Annotations alone', () => {
		const { root, done } = decorate(TABLE, 'Doreth Kell', 'Doreth Kell');
		expect(done).toBe(false);
		expect(root.innerHTML).toBe('Doreth Kell');
	});
});

describe('decorateRendered: a Target across sections', () => {
	const TEXT =
		'Alpha {beta.\n\n## Middle\n\n```\n} {\n```\n\nGamma}[^r1] delta.\n\n' +
		'- {**Burnside** left.\n- **The two**}[^r11] carrying.\n\n[^r1]: c\n[^r11]: Merge.\n';

	it('highlights from the { to the end of the section where the Target starts', () => {
		expect(seen(decorate(TEXT, 'Alpha {beta.', '<p>Alpha {beta.</p>').root)).toBe('Alpha [beta.]');
	});

	it('highlights a heading inside the Target', () => {
		expect(seen(decorate(TEXT, '## Middle', '<h2>Middle</h2>').root)).toBe('[Middle]');
	});

	it('highlights a code block inside the Target, its braces being its own', () => {
		const { root, done } = decorate(TEXT, '```\n} {\n```', '<pre><code>} {\n</code></pre>');
		expect(done).toBe(true);
		expect(seen(root)).toBe('[} {\n]');
		const tilde = 'A {b.\n\n~~~\n} {\n~~~\n\nc}[^r1]\n';
		const fenced = decorate(tilde, '~~~\n} {\n~~~', '<pre><code>} {\n</code></pre>');
		expect(fenced.done).toBe(true);
	});

	it('highlights from the start of the section where the Target ends', () => {
		const html = '<p>Gamma}<sup class="footnote-ref"><a href="#fn-1">[1]</a></sup> delta.</p>';
		expect(seen(decorate(TEXT, 'Gamma}[^r1] delta.', html).root)).toBe('[Gamma]<comment r1> delta.');
	});

	it('highlights across list items, leaving the bullets out (r11)', () => {
		const html =
			'<ul>\n<li>{<strong>Burnside</strong> left.</li>\n' +
			'<li><strong>The two</strong>}<sup class="footnote-ref"><a href="#fn-2">[2]</a></sup> carrying.</li>\n</ul>';
		const slice = '- {**Burnside** left.\n- **The two**}[^r11] carrying.';
		const { root } = decorate(TEXT, slice, html);
		expect(seen(root)).toBe('\n[Burnside][ left.]\n[The two]<comment r11> carrying.\n');
		expect(root.querySelectorAll('li > .rm-target, li > strong > .rm-target')).toHaveLength(3);
	});
});

describe('decorateRendered: rendered blocks', () => {
	it('hides a footnote reference rendered as <sup> and puts the badge after it', () => {
		const text = 'Kell fails {the save}[^r1] here.\n\n[^r1]: Check.\n';
		const { root } = decorate(
			text,
			'Kell fails {the save}[^r1] here.',
			'<p>Kell fails {the save}<sup class="footnote-ref"><a href="#fn-1">[1]</a></sup> here.</p>',
		);
		expect(seen(root)).toBe('Kell fails [the save]<comment r1> here.');
		expect(root.querySelector('sup')?.classList.contains('rm-hidden')).toBe(true);
	});

	it('highlights nested Targets and plain braces inside a Target', () => {
		const text = 'a {b {c}[^r2] d {e} f}[^r1] g';
		const { root } = decorate(text, text, `<p>a {b {c}r2 d {e} f}r1 g</p>`);
		expect(seen(root)).toBe('a [b ][c]<comment r2>[ d {e} f]<comment r1> g');
	});

	it('ignores braces in code', () => {
		const text = 'Run `f{x}` on {it}[^r1].';
		const { root } = decorate(text, text, '<p>Run <code>f{x}</code> on {it}r1.</p>');
		expect(seen(root)).toBe('Run f{x} on [it]<comment r1>.');
	});

	it('leaves the block untouched when the rendered braces do not line up with the source', () => {
		const text = 'Odd {a}[^r1] text.';
		const html = '<p>Odd {a}r1 te{xt.</p>';
		const { root, done } = decorate(text, text, html);
		expect(done).toBe(false);
		expect(root.innerHTML).toBe(html);
	});

	it('is undone by undecorate', () => {
		const html = '{<a class="internal-link">Malas Vance</a> (the Peddler)}r8';
		const { root } = decorate(TABLE, '{[[malas-vance\\|Malas Vance]] (the Peddler)}[^r8]', html);
		undecorate(root);
		expect(root.innerHTML).toBe(html);
	});

	it('decorates again from scratch when called twice', () => {
		const slice = '{17 (fail)}[^r9]';
		const { root } = decorate(TABLE, slice, '{17 (fail)}r9');
		const from = TABLE.indexOf(slice);
		decorateRendered(root, TABLE, { from, to: from + slice.length }, parse(TABLE).annotations, badge);
		expect(seen(root)).toBe('[17 (fail)]<comment r9>');
	});
});
