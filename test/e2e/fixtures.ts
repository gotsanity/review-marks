// Fixture vaults live in test/e2e/vaults/<name>/. Paths are relative to the
// repo root, which is where wdio runs. Sessions and resetVault/reloadObsidian
// always work on a temp copy, so specs can't change the fixtures on disk.

export const VAULTS = {
	/** The prototype's two 12-case sample notes, one per definition placement. */
	reviewSamples: 'test/e2e/vaults/review-samples',
	/** No notes, only an empty config dir. See resetVaultTo in harness.ts. */
	empty: 'test/e2e/vaults/empty',
} as const;

/** The vault every session opens with (see wdio.conf.mts). */
export const DEFAULT_VAULT = VAULTS.reviewSamples;

export const NOTES = {
	/** Every definition at the end of the note. */
	endOfNote: 'Review sample - end of note.md',
	/** Each definition at the end of its Target's section. */
	endOfSection: 'Review sample - end of section.md',
} as const;
