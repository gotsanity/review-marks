// How the Reviewer turns Review Mode on and off and sees its state: the "Toggle review mode"
// command, the status bar indicator (shown only while on), the sidebar header button and a Notice
// on every toggle. Desktop only: the caller registers none of it on mobile.
import { Notice, setIcon, type Plugin } from 'obsidian';
import type { ReviewModeStore } from './store';

export const REVIEW_MODE_ICON = 'highlighter';

/** What a click on the header button does, given the state. */
export const toggleLabel = (on: boolean): string => (on ? 'Turn off review mode' : 'Turn on review mode');

/**
 * Registers the command, the toast and the status bar indicator. Call it before the annotation
 * count's status bar item is added, so the indicator sits just left of it.
 */
export function registerReviewMode(plugin: Plugin, store: ReviewModeStore): void {
	plugin.addCommand({ id: 'toggle-review-mode', name: 'Toggle review mode', callback: () => store.toggle() });
	plugin.register(store.onChange((on) => new Notice(on ? 'Review mode on: select text to annotate it.' : 'Review mode off')));

	const el = plugin.addStatusBarItem();
	el.addClass('rm-status-review-mode', 'mod-clickable');
	el.setAttr('aria-label', toggleLabel(true));
	setIcon(el.createSpan({ cls: 'status-bar-item-icon' }), REVIEW_MODE_ICON);
	el.createSpan({ text: 'Review mode' });
	el.addEventListener('click', () => store.set(false));
	const update = (on: boolean) => el.toggleClass('rm-hidden', !on);
	update(store.on);
	plugin.register(store.onChange(update));
}

/**
 * Adds a File explorer style header row above `contentEl` with the Review Mode button. Returns a
 * function that removes its listener.
 */
export function reviewModeHeader(containerEl: HTMLElement, contentEl: HTMLElement, store: ReviewModeStore): () => void {
	const header = containerEl.createDiv({ cls: 'nav-header rm-sidebar-header' });
	containerEl.insertBefore(header, contentEl);
	const buttons = header.createDiv({ cls: 'nav-buttons-container' });
	const button = buttons.createDiv({ cls: 'clickable-icon nav-action-button rm-review-mode-button' });
	setIcon(button, REVIEW_MODE_ICON);
	button.addEventListener('click', () => store.toggle());
	const update = (on: boolean) => {
		button.toggleClass('is-active', on);
		button.setAttr('aria-label', toggleLabel(on));
	};
	update(store.on);
	const stop = store.onChange(update);
	return () => {
		stop();
		header.remove();
	};
}
