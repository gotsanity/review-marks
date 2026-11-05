import { describe, expect, it } from 'vitest';
import { ReviewModeStore } from './store';

describe('ReviewModeStore', () => {
	it('is off when created', () => {
		expect(new ReviewModeStore().on).toBe(false);
	});

	it('toggles, and tells each listener the new state', () => {
		const store = new ReviewModeStore();
		const seen: boolean[] = [];
		store.onChange((on) => seen.push(on));
		store.toggle();
		store.toggle();
		expect(seen).toEqual([true, false]);
		expect(store.on).toBe(false);
	});

	it('only notifies when the state changes', () => {
		const store = new ReviewModeStore();
		const seen: boolean[] = [];
		store.onChange((on) => seen.push(on));
		store.set(false);
		store.set(true);
		store.set(true);
		expect(seen).toEqual([true]);
	});

	it('stops notifying a listener once unsubscribed', () => {
		const store = new ReviewModeStore();
		const seen: boolean[] = [];
		const stop = store.onChange((on) => seen.push(on));
		stop();
		store.toggle();
		expect(seen).toEqual([]);
	});
});
