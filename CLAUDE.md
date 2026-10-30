## Agent skills

### Issue tracker

Issues live in GitHub Issues for gotsanity/review-marks, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

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
