## Agent skills

### Issue tracker

Issues live in GitHub Issues for gotsanity/review-marks, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Code layout

One folder or file per module, so features land as new files:

- `src/core/`: the annotation core. Pure, no Obsidian or CodeMirror imports. `parse(text)` returns an `AnnotationDoc`; planners such as `planCreate` return a plan with `Change[]` or a `Refusal`. Every format rule goes here, with tests.
- `src/apply/`: change application. `ChangeTarget.apply(planner)` has two implementations: `EditorChangeTarget` (one CodeMirror transaction with `isolateHistory`, no scroll) and `FileChangeTarget` (`Vault.process`). `provisional.ts` holds a new Annotation outside the undo history while its Comment is typed.
- `src/guards.ts`: every fragile API (`editor.cm`, `scrollSnapshot`, …) with its fallback.
- `src/comment-box/`: the inline comment box. Callers decide what save and cancel do.
- `src/live-preview/`: Live Preview decorations and the badge.
- `src/rendered/`: decorates rendered HTML against a slice of the source. `align.ts` is pure (tested on plain strings); `decorate.ts` applies it to the DOM and fails closed.
- `src/reading-view/`: the Reading view post processor (`getSectionInfo` only) and the footnote list.
- `src/popover/`: the comment popover. `attach(root, resolve)` wires it to the Targets and badges under any element.
- `src/commands/`: one file per command. `src/settings.ts`: settings, defaults and `SettingsStore` (`update` saves and notifies `onChange` listeners). `src/main.ts`: wiring only.
- `src/settings-tab/`: the settings tab. It has no controls of its own: a feature adds a section with `plugin.settingsTab.addSection(SECTION_ORDER.<feature>, (containerEl, store) => …)`, reading `store.current` and saving with `store.update({ … })`. Changes apply to open notes at once.

## Testing

The plugin's floor is Obsidian 1.7.4 (`minAppVersion`). The `obsidian` typings stay pinned at 1.7.2 because no 1.7.4 typings were published, and using newer typings would let APIs above the floor type-check. CI (`.github/workflows/ci.yml`) runs lint, typecheck, build, unit tests and end-to-end tests on every PR.

### Unit tests (Vitest)

- `npm test` runs once; `npm run test:watch` watches.
- Tests sit next to the code as `src/**/*.test.ts`. Pure modules (the annotation core, selection mapping) are tested here on plain strings or a fake DOM, never with Obsidian imports.

### End-to-end tests (wdio-obsidian-service)

- `npm run build`, then `npm run test:e2e`. The harness installs the built plugin from the repo root (`manifest.json`, `main.js`, `styles.css`), so rebuild after every source change.
- By default each spec runs against Obsidian 1.7.4 (`earliest`, the manifest floor) and `latest`. The first run downloads both into `.obsidian-cache/` (git-ignored).
- Obsidian runs sandboxed, with its own config and a temp copy of the vault. On Windows, `wdio.conf.mts` backs up the `obsidian://` link handler before the run and restores it afterwards.

**Run against one Obsidian version.** Set `OBSIDIAN_VERSIONS` to space-separated `appVersion/installerVersion` pairs:

```sh
OBSIDIAN_VERSIONS="earliest/earliest" npm run test:e2e   # 1.7.4 only
OBSIDIAN_VERSIONS="latest/latest" npm run test:e2e
OBSIDIAN_VERSIONS="1.7.7/latest" npm run test:e2e        # any specific version
```

In PowerShell, set `$env:OBSIDIAN_VERSIONS = "earliest/earliest"` first. To run one spec, add `-- --spec test/e2e/specs/smoke.e2e.ts`.

**Add an end-to-end spec.** Create `test/e2e/specs/<feature>.e2e.ts`; `wdio.conf.mts` picks up every `*.e2e.ts` there. Import `describe`/`it` from `mocha` and `browser`/`expect` from `@wdio/globals` (globals aren't injected). Follow `test/e2e/specs/smoke.e2e.ts`. Useful helpers:

- `browser.executeObsidian(({ app, obsidian, plugins }) => …)` runs a function inside Obsidian. `plugins.reviewMarks` is this plugin's instance. The function is serialized, so pass values in as extra arguments rather than closing over them.
- `browser.executeObsidianCommand('review-marks:<command-id>')` runs a command.
- `obsidianPage.openFile(path)`, `obsidianPage.read(path)` and `obsidianPage.write(path, content)` from `wdio-obsidian-service`.
- `browser.getObsidianVersion()` returns the version under test, for version-specific expectations.

**Open a fixture vault.** Fixture vaults are folders under `test/e2e/vaults/`, registered in `test/e2e/fixtures.ts` (`VAULTS`, plus note names in `NOTES`). Every session starts in `DEFAULT_VAULT` (`review-samples`). To get a clean copy or switch vaults:

- `await obsidianPage.resetVault()` in a `beforeEach` restores the session's vault files in place. This is fast, and is the default way to undo a test's edits.
- `await obsidianPage.resetVault(VAULTS.other)` swaps in another vault's files without restarting.
- `await browser.reloadObsidian({ vault: VAULTS.other })` restarts Obsidian on a fresh copy. It's slow; use it only when you need clean app state or config.

To add a vault, create `test/e2e/vaults/<name>/` with its notes (and an `.obsidian/app.json` if settings matter), then add it to `VAULTS`. Specs work on copies, so the fixtures on disk never change.

`review-samples` holds the prototype's two 12-case notes, `Review sample - end of note.md` and `Review sample - end of section.md` (same 12 annotations, with the definitions at the end of the note or at the end of each Target's section). The cases are listed in `prototypes/storage-format/README.md` on `origin/prototype/storage-format`. Don't edit them: later tickets assert against their exact text. Make a new vault for other content.

## Commits

Every commit must be a Conventional Commit (`@commitlint/config-conventional`). A husky `commit-msg` hook (installed by `npm install`) and the `commitlint` CI job on PRs both reject anything else.

- `feat:` bumps minor. `fix:` and `perf:` bump patch. All three appear in the changelog, so write their subjects as user-facing release notes.
- `chore:`, `ci:`, `build:`, `docs:`, `refactor:`, `test:`, `style:` don't release anything and stay out of the changelog.
- `feat!:` or a `BREAKING CHANGE:` footer marks a breaking change. While below 1.0.0 it bumps minor, not major (`bump-minor-pre-major`). Go to 1.0.0 deliberately with a `Release-As: 1.0.0` footer.
- Don't use `feat:` for tooling or merge commits; it lands in the changelog.

## Releases

release-please (`.github/workflows/release-please.yml`) runs on every push to `main`.

- When `main` has unreleased `feat`/`fix`/`perf` commits, it opens or updates a release PR that bumps `package.json`, `package-lock.json`, `manifest.json`, `.release-please-manifest.json` and `CHANGELOG.md`. CI then adds the `versions.json` entry (`"<version>": "<minAppVersion>"`) to that PR.
- Merging the release PR tags the merge commit with the bare version (`0.1.0`, no `v`), creates the GitHub release, builds, and attaches `main.js`, `manifest.json` and `styles.css`.
- To cut a release: merge the open release PR. Don't edit versions by hand. Release PRs are opened by `GITHUB_TOKEN`, so their CI runs only after someone clicks "Approve workflows to run".
- The first `feat:` on `main` produces 0.1.0 (`initial-version`).

## Before publishing / when the repo goes public

The repo is private for now, so the `actions/attest` build-provenance step in the publish job is skipped (attestations need a public repo on this plan). Before submitting to Obsidian, work through this list:

- [ ] Make the repo public. Obsidian downloads releases from it.
- [ ] Cut a release and confirm the "Generate artifact attestation" step ran rather than being skipped. Verify it: `gh release download <tag> -p main.js` then `gh attestation verify main.js --repo gotsanity/review-marks`.
- [ ] Re-check that the plugin id `review-marks` is still free in `community-plugins.json` in obsidianmd/obsidian-releases.
- [ ] Submit through community.obsidian.md.
