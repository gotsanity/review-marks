// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parse } from './core';
import './test-support/fake-dom';
import { badgeLabel, createBadge } from './badge';

const doc = parse('A {long target}[^r1] and {gone}[^r2].\n\n[^r1]: A comment that runs on and on.\n');
const [r1, r2] = doc.annotations;

describe('badgeLabel', () => {
	it('shows the start of the Comment, "…" while it is typed, or the marker when the definition is missing', () => {
		if (!r1 || !r2) throw new Error('no annotations');
		expect(badgeLabel(r1, 10, false)).toBe('A comment…');
		expect(badgeLabel(r1, 10, true)).toBe('…');
		expect(badgeLabel(r2, 10, false)).toBe('[^r2]?');
	});
});

describe('createBadge', () => {
	it('makes the pill with the Annotation ID the popover reads', () => {
		const el = createBadge('r1', 'A comment…');
		expect(el.className).toBe('rm-badge');
		expect(el.textContent).toBe('A comment…');
		expect(el.getAttribute('data-rm-id')).toBe('r1');
	});
});
