// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { trackPointer } from './track';

const pointer = (type: string, pointerId = 1) => new PointerEvent(type, { pointerId, bubbles: true, cancelable: true });

function track() {
	const log: string[] = [];
	const cancel = trackPointer(window, pointer('pointerdown'), {
		move: (e) => log.push(`move:${e.type}`),
		finish: (create) => log.push(`finish:${create}`),
		settled: () => log.push('settled'),
	});
	return { log, cancel };
}

const tick = () => new Promise((resolve) => window.setTimeout(resolve, 0));

describe('trackPointer', () => {
	it('follows the pointer and creates on release, swallowing the click that trails it', async () => {
		const { log } = track();
		window.dispatchEvent(pointer('pointermove'));
		window.dispatchEvent(pointer('pointermove', 2));
		window.dispatchEvent(pointer('pointerup'));
		const click = new MouseEvent('click', { bubbles: true, cancelable: true });
		document.body.dispatchEvent(click);
		expect(click.defaultPrevented).toBe(true);
		expect(log).toEqual(['move:pointermove', 'move:pointerup', 'finish:true']);

		await tick();
		expect(log.at(-1)).toBe('settled');
		const later = new MouseEvent('click', { bubbles: true, cancelable: true });
		document.body.dispatchEvent(later);
		expect(later.defaultPrevented).toBe(false);
	});

	it('ends without creating on Escape, a cancelled pointer or cancel()', () => {
		const a = track();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
		window.dispatchEvent(pointer('pointerup'));
		expect(a.log).toEqual(['finish:false']);

		const b = track();
		window.dispatchEvent(pointer('pointercancel'));
		expect(b.log).toEqual(['finish:false']);

		const c = track();
		c.cancel();
		c.cancel();
		expect(c.log).toEqual(['finish:false']);
	});
});
