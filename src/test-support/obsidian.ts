// A stand-in for the `obsidian` module in unit tests (aliased in vitest.config.ts): the npm package
// ships typings only. It covers just what code under test uses, and draws the same markup as
// Obsidian's `Setting` so tests can query `.setting-item-name` and friends. Not bundled.

class ButtonComponent {
	readonly buttonEl: HTMLButtonElement;
	constructor(containerEl: HTMLElement) {
		this.buttonEl = containerEl.appendChild(containerEl.ownerDocument.createElement('button'));
	}
	setButtonText(text: string): this {
		this.buttonEl.textContent = text;
		return this;
	}
	setCta(): this {
		this.buttonEl.classList.add('mod-cta');
		return this;
	}
	setTooltip(tooltip: string): this {
		this.buttonEl.setAttribute('aria-label', tooltip);
		return this;
	}
	onClick(callback: (evt: MouseEvent) => unknown): this {
		this.buttonEl.addEventListener('click', (evt) => void callback(evt));
		return this;
	}
}

class ExtraButtonComponent {
	readonly extraSettingsEl: HTMLElement;
	constructor(containerEl: HTMLElement) {
		this.extraSettingsEl = containerEl.appendChild(containerEl.ownerDocument.createElement('div'));
		this.extraSettingsEl.className = 'clickable-icon extra-setting-button';
	}
	setIcon(icon: string): this {
		this.extraSettingsEl.dataset.icon = icon;
		return this;
	}
	setTooltip(tooltip: string): this {
		this.extraSettingsEl.setAttribute('aria-label', tooltip);
		return this;
	}
	onClick(callback: () => unknown): this {
		this.extraSettingsEl.addEventListener('click', () => void callback());
		return this;
	}
}

export class Setting {
	readonly settingEl: HTMLElement;
	readonly infoEl: HTMLElement;
	readonly nameEl: HTMLElement;
	readonly descEl: HTMLElement;
	readonly controlEl: HTMLElement;

	constructor(containerEl: HTMLElement) {
		const div = (parent: HTMLElement, cls: string) => {
			const el = parent.appendChild(parent.ownerDocument.createElement('div'));
			el.className = cls;
			return el;
		};
		this.settingEl = div(containerEl, 'setting-item');
		this.infoEl = div(this.settingEl, 'setting-item-info');
		this.nameEl = div(this.infoEl, 'setting-item-name');
		this.descEl = div(this.infoEl, 'setting-item-description');
		this.controlEl = div(this.settingEl, 'setting-item-control');
	}
	setName(name: string): this {
		this.nameEl.textContent = name;
		return this;
	}
	setDesc(desc: string): this {
		this.descEl.textContent = desc;
		return this;
	}
	setHeading(): this {
		this.settingEl.classList.add('setting-item-heading');
		return this;
	}
	addButton(cb: (button: ButtonComponent) => unknown): this {
		cb(new ButtonComponent(this.controlEl));
		return this;
	}
	addExtraButton(cb: (button: ExtraButtonComponent) => unknown): this {
		cb(new ExtraButtonComponent(this.controlEl));
		return this;
	}
}
