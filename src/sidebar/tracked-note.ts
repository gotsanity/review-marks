// Which note the sidebar lists: it follows the active note, keeps it while the sidebar itself is
// used, and clears it for any other main-area tab.
import { MarkdownView, type App, type TFile, type WorkspaceLeaf } from 'obsidian';
import { changeTargetFor } from '../apply/editor-target';
import { FileChangeTarget } from '../apply/file-target';
import type { ChangeTarget } from '../apply/change-target';
import { normalizeLineEndings } from '../core';

export class TrackedNote {
	file: TFile | null = null;
	/** The note's leaf, remembered because using the sidebar makes the sidebar the active leaf. */
	leaf: WorkspaceLeaf | null = null;

	constructor(private readonly app: App) {}

	/**
	 * Follows `leaf`: a note is listed, another main-area tab clears the list, sidebars are ignored.
	 * Returns whether the listed note changed.
	 */
	follow(leaf: WorkspaceLeaf | null): boolean {
		if (leaf?.view instanceof MarkdownView) {
			if (leaf === this.leaf && leaf.view.file === this.file) return false;
			this.leaf = leaf;
			this.file = leaf.view.file;
			return true;
		}
		if (leaf && leaf.getRoot() === this.app.workspace.rootSplit) {
			this.clear();
			return true;
		}
		return false;
	}

	clear(): void {
		this.leaf = null;
		this.file = null;
	}

	/** An open MarkdownView of the note, preferring the leaf it was last active in. */
	markdownView(): MarkdownView | null {
		const leaves = [this.leaf, ...this.app.workspace.getLeavesOfType('markdown')];
		for (const leaf of leaves) if (leaf?.view instanceof MarkdownView && leaf.view.file === this.file) return leaf.view;
		return null;
	}

	/** Where edits to `file` go: its open editor (one undo step), else the file through `Vault.process`. */
	changeTarget(file: TFile): ChangeTarget {
		const view = this.markdownView();
		return view ? changeTargetFor(view.editor) : new FileChangeTarget(this.app.vault, file);
	}

	/** The note's text, LF line breaks: from its open editor, else from the vault. */
	async readText(file: TFile): Promise<string> {
		const view = this.markdownView();
		return normalizeLineEndings(view ? view.editor.getValue() : await this.app.vault.cachedRead(file));
	}
}
