import type { TFile } from 'obsidian';
import { applyChanges, isRefusal, normalizeLineEndings, parse, type Refusal } from '../core';
import type { ChangeTarget, PlannedEdit, Planner } from './change-target';

/** The part of Obsidian's `Vault` this needs. */
export interface ProcessingVault<F> {
	process(file: F, fn: (data: string) => string): Promise<string>;
}

/**
 * Change application for a note that isn't open: one atomic `Vault.process`. The core works on
 * LF text, so a CRLF file is read as LF and written back as CRLF.
 */
export class FileChangeTarget<F = TFile> implements ChangeTarget {
	constructor(
		private readonly vault: ProcessingVault<F>,
		private readonly file: F,
	) {}

	async apply<P extends PlannedEdit>(planner: Planner<P>): Promise<P | Refusal> {
		let result: P | Refusal | undefined;
		await this.vault.process(this.file, (data) => {
			const crlf = data.includes('\r\n');
			const text = normalizeLineEndings(data);
			const plan = planner(parse(text));
			result = plan;
			if (isRefusal(plan)) return data;
			const out = applyChanges(text, plan.changes);
			return crlf ? out.replace(/\n/g, '\r\n') : out;
		});
		if (result === undefined) throw new Error('Vault.process did not run the planner');
		return result;
	}
}
