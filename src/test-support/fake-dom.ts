// Helpers for fake-DOM unit tests (`// @vitest-environment happy-dom`). Not bundled.

/** A `<div>` holding `html`, attached to the fake document. */
export function block(html: string): HTMLElement {
	const parsed = new DOMParser().parseFromString(`<body><div>${html}</div></body>`, 'text/html');
	const el = document.adoptNode(parsed.body.firstElementChild as HTMLElement);
	document.body.appendChild(el);
	return el;
}

function textNodes(root: Node): Text[] {
	const nodes: Text[] = [];
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
	return nodes;
}

/** A DOM Range over the first occurrence of `needle` in the text of `root` (all text nodes, joined). */
export function rangeOver(root: Node, needle: string): Range {
	const nodes = textNodes(root);
	const all = nodes.map((n) => n.data).join('');
	const start = all.indexOf(needle);
	if (start < 0) throw new Error(`"${needle}" is not rendered`);
	const at = (offset: number, preferNext: boolean): [Text, number] => {
		let base = 0;
		for (const n of nodes) {
			const end = base + n.data.length;
			if (offset < end || (offset === end && !preferNext)) return [n, offset - base];
			base = end;
		}
		const last = nodes[nodes.length - 1] as Text;
		return [last, last.data.length];
	};
	const range = document.createRange();
	range.setStart(...at(start, true));
	range.setEnd(...at(start + needle.length, false));
	return range;
}
