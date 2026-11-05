// Review Mode's on/off state, one for the whole workspace. Never saved, so it is off on every
// launch. The command, the sidebar header button and the status bar indicator all change it.

export class ReviewModeStore {
	private state = false;
	private readonly listeners = new Set<(on: boolean) => void>();

	get on(): boolean {
		return this.state;
	}

	set(on: boolean): void {
		if (on === this.state) return;
		this.state = on;
		for (const listener of this.listeners) listener(on);
	}

	toggle(): void {
		this.set(!this.state);
	}

	/** Calls `listener` after every change. Returns a function that stops it. */
	onChange(listener: (on: boolean) => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}
}
