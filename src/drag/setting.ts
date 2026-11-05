// The "Annotate-on-drag trigger" setting section: a key recorder. Click the field, hold the
// modifiers, and the largest combination held is saved once every key is released.
import { Scope, Setting, type App } from 'obsidian';
import { notify } from '../notice';
import type { SettingsSection } from '../settings-tab/settings-tab';
import { TriggerRecording, type RecordingStep } from './recording';
import { triggerLabel } from './trigger';

/** Builds the section. `isMac` is `Platform.isMacOS`. */
export function dragSettings(app: App, isMac: boolean): SettingsSection {
	return (containerEl, store) => {
		const setting = new Setting(containerEl)
			.setName('Annotate-on-drag trigger')
			.setDesc(
				"Hold these keys while you drag-select text to annotate it at once. The editor's own behaviour for this combination is turned off while the setting is on. Click the field and press the keys to change it.",
			);
		const hint = setting.descEl.createDiv({ cls: 'rm-trigger-hint mod-warning' });
		const field = setting.controlEl.createEl('button', { cls: 'rm-trigger-field' });
		let stop: (() => void) | null = null;

		const showStored = () => {
			field.setText(triggerLabel(store.current.dragTrigger, isMac));
			field.removeClass('mod-cta');
			hint.setText('');
		};

		const start = () => {
			const recording = new TriggerRecording(isMac);
			const win = field.win;
			// Swallows every key while recording, so Esc doesn't close Settings and no command runs.
			const scope = new Scope();
			scope.register(null, null, () => false);
			app.keymap.pushScope(scope);

			const end = () => {
				win.removeEventListener('keydown', onKeydown, true);
				win.removeEventListener('keyup', onKeyup, true);
				field.removeEventListener('blur', cancel);
				app.keymap.popScope(scope);
				stop = null;
			};
			const cancel = () => {
				end();
				showStored();
			};
			const handle = (event: KeyboardEvent, step: RecordingStep) => {
				event.preventDefault();
				event.stopPropagation();
				if (!field.isConnected) return end();
				if (step.kind === 'cancelled') return cancel();
				if (step.kind === 'recording') {
					field.setText(`${step.label || 'Press the keys'}…`);
					if (step.ignored !== undefined) {
						hint.setText(`Only modifier keys count: “${step.ignored}” was ignored. Esc cancels.`);
					}
					return;
				}
				end();
				if (step.trigger === null) {
					notify(`the annotate-on-drag trigger can't be ${step.label}. Nothing was saved.`);
					showStored();
					return;
				}
				void store.update({ dragTrigger: step.trigger }).then(showStored);
			};
			const onKeydown = (event: KeyboardEvent) => handle(event, recording.keydown(event));
			const onKeyup = (event: KeyboardEvent) => handle(event, recording.keyup(event));

			win.addEventListener('keydown', onKeydown, true);
			win.addEventListener('keyup', onKeyup, true);
			field.addEventListener('blur', cancel);
			stop = cancel;
			field.setText('Press the keys…');
			field.addClass('mod-cta');
			hint.setText('');
		};

		field.addEventListener('click', () => {
			if (!stop) start();
		});
		setting.addExtraButton((button) => {
			button.extraSettingsEl.addClass('rm-trigger-off');
			button
				.setIcon('x')
				.setTooltip('Turn off')
				.onClick(async () => {
					stop?.();
					await store.update({ dragTrigger: 'off' });
					showStored();
				});
		});
		showStored();
	};
}
