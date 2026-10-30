# CI/CD release pipeline: release-please and Conventional Commits

Question: how should release-please and Conventional Commits be set up for Review Marks (`review-marks`), modelled on [gotsanity/Obsidian-Daggerheart-Tools](https://github.com/gotsanity/Obsidian-Daggerheart-Tools)?

Researched 2026-10-30. Sources were read directly with `gh api`:

- [S1] Obsidian-Daggerheart-Tools, default branch `master`, files as of its 1.11.0 release.
- [S2] Obsidian docs, [Release your plugin with GitHub Actions](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions). Source: `obsidianmd/obsidian-developer-docs`, `en/Plugins/Releasing/Release your plugin with GitHub Actions.md`, last changed 2026-07-29 (commit 08d3c94).
- [S3] [obsidianmd/obsidian-sample-plugin README](https://github.com/obsidianmd/obsidian-sample-plugin) and [obsidianmd/obsidian-releases README](https://github.com/obsidianmd/obsidian-releases).
- [S4] [googleapis/release-please-action README](https://github.com/googleapis/release-please-action). Latest release is v5.0.0 (2026-04-22), whose only breaking change is "upgrade to node24".
- [S5] googleapis/release-please: [`docs/customizing.md`](https://github.com/googleapis/release-please/blob/main/docs/customizing.md), [`docs/manifest-releaser.md`](https://github.com/googleapis/release-please/blob/main/docs/manifest-releaser.md), [`schemas/config.json`](https://github.com/googleapis/release-please/blob/main/schemas/config.json), and source files `src/strategies/base.ts`, `src/manifest.ts`, `src/versioning-strategies/default.ts`, `src/util/filter-commits.ts`, plus `src/index.ts` in the action.
- [S6] GitHub docs ([github/docs](https://github.com/github/docs)): `use-artifact-attestations.md`, `data/reusables/gated-features/attestations.md`, `data/reusables/actions/actions-do-not-trigger-workflows.md`, `trigger-a-workflow.md`, `managing-github-actions-settings-for-a-repository.md`, `data/reusables/actions/workflow-permissions-modifying.md`.
- [S7] [commitlint docs](https://github.com/conventional-changelog/commitlint/tree/master/docs/guides): `ci-setup.md`, `getting-started.md`.
- [S8] Earlier research in this repo, `research/plugin-submission-guidelines.md` and `research/obsidian-versions.md` (on their own `research/*` branches).

## 1. What Obsidian-Daggerheart-Tools does [S1]

### `.github/workflows/release-please.yml`

```yaml
on:
    workflow_dispatch:

    push:
        branches:
            - "master"
env:
    PLUGIN_NAME: Daggerheart-Tools

permissions:
    contents: write
    pull-requests: write
    issues: write

name: release-please

jobs:
    release-please:
        runs-on: ubuntu-latest
        outputs:
            release_created: ${{ steps.release.outputs.release_created }}
            upload_url: ${{ steps.release.outputs.upload_url }}
            tag_name: ${{ steps.release.outputs.tag_name }}
        steps:
            - uses: google-github-actions/release-please-action@v3
              id: release
              with:
                  command: manifest
                  release-type: node

    upload-build:
        runs-on: ubuntu-latest
        needs: release-please
        if: ${{ needs.release-please.outputs.release_created }}
        env:
            upload_url: ${{ needs.release-please.outputs.upload_url }}
            tag_name: ${{ needs.release-please.outputs.tag_name }}
        steps:
            - uses: actions/checkout@v4
            - name: Use Node.js
              uses: actions/setup-node@v4
              with:
                  node-version: "20.x"
            - name: Build
              id: build
              run: |
                  npm install
                  npm run build --if-present
                  mkdir ${{ env.PLUGIN_NAME }}
                  cp main.js manifest.json styles.css ${{ env.PLUGIN_NAME }}
                  zip -r ${{ env.PLUGIN_NAME }}.zip ${{ env.PLUGIN_NAME }}
            - name: Upload zip file
              uses: actions/upload-release-asset@v1
              # ... asset_name: ${{ env.PLUGIN_NAME }}-${{ env.tag_name }}.zip
            - name: Upload main.js
              uses: actions/upload-release-asset@v1
              # ... asset_name: main.js
            - name: Upload manifest.json
              uses: actions/upload-release-asset@v1
              # ... asset_name: manifest.json
            - name: Upload styles.css
              uses: actions/upload-release-asset@v1
              # ... asset_name: styles.css
```

(The four upload steps are identical apart from path, name and content type; trimmed here.)

### `.github/workflows/npm-publish.yml`

Triggers on `release: types: [created]` and `workflow_dispatch`, then runs `npm ci`, `npm run build --if-present` and `npm publish --scope=@gotsanity --access=public` with `secrets.npm_token`. Review Marks doesn't need npm publishing, so I left it out of the recommendation.

### `release-please-config.json`

```json
{
    "packages": {
        ".": {
            "changelog-path": "CHANGELOG.md",
            "release-type": "node"
        }
    },
    "include-component-in-tag": false,
    "include-v-in-tag": false,
    "extra-files": [
        {
            "type": "json",
            "path": "manifest.json",
            "jsonpath": "$.version"
        }
    ],
    "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json"
}
```

### `.release-please-manifest.json`

```json
{
  ".": "1.11.0"
}
```

### `manifest.json`

```json
{
	"id": "daggerheart-tools",
	"name": "Daggerheart Tools",
	"version": "1.11.0",
	"minAppVersion": "0.15.0",
	...
	"isDesktopOnly": false
}
```

### `versions.json`

```json
{
	"1.0.0": "0.15.0"
}
```

The file is stuck at 1.0.0. Nothing in the release-please flow updates it (see section 2).

### `package.json` scripts

```json
"dev": "node esbuild.config.mjs",
"build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
"version": "node version-bump.mjs && git add manifest.json versions.json",
"svelte-check": "svelte-check --tsconfig tsconfig.json"
```

### `version-bump.mjs`

This is the sample-plugin script, unchanged. It reads `npm_package_version`, writes it into `manifest.json`, and adds `versions[targetVersion] = minAppVersion` to `versions.json`. It only runs through `npm version`, which release-please never calls.

### `.npmrc`

```
tag-version-prefix=""
```

This only affects `npm version` tags. release-please ignores it.

### Commit style

There is no commitlint, husky or lefthook config and no CONTRIBUTING file. Commit style is set only in `CLAUDE.md`:

> 4. **Commit using Conventional Commits** ... Common prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`. These drive the CHANGELOG and version bump — write subject lines as customer-facing descriptions.

`CLAUDE.md` also describes a `feature-branch → development → master` flow with merge commits, and says merging the release PR is a manual step for the owner. It has drifted in places. It says "Current version: 1.1.1" and that the workflow runs on push to `main`, but the default branch is now `master`.

### Release history

- Tags run from `1.1.0` to `1.11.0` with no `v` prefix. The release titles do have one (`v1.11.0`), because `include-v-in-release-name` defaults to `true` [S5 schema]. That's only cosmetic.
- The 1.11.0 release has four assets: `Daggerheart-Tools-1.11.0.zip`, `main.js`, `manifest.json`, `styles.css`. `github-actions[bot]` created it.
- Release PR #51, `chore(master): release 1.11.0`, touched `.release-please-manifest.json`, `CHANGELOG.md`, `manifest.json`, `package-lock.json` and `package.json`. It did not touch `versions.json`.
- Most commits follow Conventional Commits. A few don't ("Change default branch from 'main' to 'master'"), and release-please skips those silently. One `feat: merge development into master` ended up as a changelog entry for 1.9.0, which shows that a sloppy prefix becomes release notes.
- Repo settings: `default_workflow_permissions: write`, `can_approve_pull_request_reviews: true`. The only secret is `NPM_TOKEN`. No PAT.
- `npm-publish.yml` has no recorded runs, and npm stops at 1.8.0. That fits the GITHUB_TOKEN rule in section 4: a release created by GITHUB_TOKEN doesn't fire `release: created`. The earlier npm versions were probably published by hand.

### Where it departs from current practice

1. `google-github-actions/release-please-action@v3` lives in an archived repo ("Archived version of release-please"). The current action is `googleapis/release-please-action`, now at v5. The `command: manifest` input is gone. Manifest mode is the default as long as you don't set `release-type` [S4, "Upgrading from v3 to v4"].
2. `actions/upload-release-asset@v1` is archived. The action README now uses `gh release upload <tag> <files>` [S4, "Attaching files to the GitHub release"].
3. There's no build provenance attestation. Obsidian recommends `actions/attest@v4` [S2].
4. `versions.json` is never updated.
5. `npm install` instead of `npm ci`, and `--if-present` on the build. Obsidian's scanner checks that the release `main.js` matches what `npm run build` produces from the committed source [S8], so a lockfile-exact install and a build that can't be skipped both matter.
6. The build job checks out the pushed commit, not the tag. That works because the release commit is the push, but checking out `tag_name` is more explicit.
7. `release-type: node` appears in both the workflow and the config. With v4+ you set it only in the config.

## 2. What release-please needs to version an Obsidian plugin

### Obsidian's rules [S2, S3, S8]

- `manifest.json` `version` is plain `x.y.z`. The release tag must equal it exactly, with no `v`. Obsidian reads `manifest.json` from the default branch to learn the latest version, then downloads assets from the release with that exact tag.
- `main.js` and `manifest.json` must be individual release assets. `styles.css` is optional. A zip doesn't count.
- `versions.json` maps plugin version to `minAppVersion`. Obsidian only reads it when the `minAppVersion` in the current manifest is higher than the running app [S3, obsidian-releases README]. It then picks the newest compatible plugin version listed there. The sample plugin says to add an entry for every release.
- Obsidian's own workflow [S2] triggers on any tag push, needs `contents: write`, `id-token: write` and `attestations: write`, runs `npm install` and `npm run build`, attests `main.js`, `manifest.json` and `styles.css` with `actions/attest@v4`, then runs `gh release create "$tag" --draft main.js manifest.json styles.css`. It also tells you to set "Read and write permissions" under Settings > Actions > General.

### Bumping `package.json` and `manifest.json`

With `release-type: node`, release-please updates `package.json` and `package-lock.json` itself. `manifest.json` needs an `extra-files` entry using the JSON updater [S5 customizing.md, "Updating arbitrary JSON files"]:

```json
"extra-files": [
  { "type": "json", "path": "manifest.json", "jsonpath": "$.version" }
]
```

Daggerheart does exactly this, and it works (PR #51 changed `manifest.json`).

### Updating `versions.json`

release-please can't do this by itself. The JSON updater changes the value at an existing path. It doesn't add a new key, and `versions.json` needs a new key (`"0.2.0": "1.7.2"`) each release. The generic updater works on lines tagged with `x-release-please-*` comments [S5 customizing.md], and JSON has no comments. So something outside release-please has to write it.

The options:

- **A. Push the entry onto the release PR branch from the same workflow (recommended).** The action outputs `pr`, a JSON `PullRequest` object with `headBranchName` [S4 Outputs; `src/pull-request.ts`]. A second job checks out that branch, runs `version-bump.mjs`, and commits `versions.json` if it changed. The entry then lands in the same merge as the version bump, so `main` never shows a version that `versions.json` lacks. Pushing with GITHUB_TOKEN triggers nothing new, so it can't loop. When release-please later rewrites the PR branch, the next run puts the entry back.
- **B. Commit to `main` after release.** This is simpler, but it pushes straight to `main`, which branch protection would block. It also leaves the release commit without the entry.
- **C. Edit it by hand, only when `minAppVersion` changes.** This is what Daggerheart does in practice. It's harmless while `minAppVersion` never moves. Once it does, users on older apps get an older plugin version than they could have had.

### Tag format

```json
"include-v-in-tag": false,
"include-component-in-tag": false,
"include-v-in-release-name": false
```

`include-v-in-tag` defaults to `true`, and `include-component-in-tag` defaults to `true` for manifest configs [S5 schema]. Set both to `false` to get tags like `0.1.0`. `include-v-in-release-name: false` makes the release title match the tag, as in Obsidian's workflow (`--title="$tag"`). Daggerheart doesn't set it, which is why its titles read `v1.11.0`.

### Building and attaching assets

release-please creates the GitHub release and tag when the release PR merges. It sets `release_created`, which is unset when nothing was released [action `src/index.ts`], and `tag_name`. A follow-up job in the same workflow run gated on `release_created` checks out the tag, runs `npm ci` and `npm run build`, attests the files, and runs `gh release upload "$tag" main.js manifest.json styles.css` [S4]. Because this happens inside the same run, no cross-workflow trigger and no PAT are needed.

There is a short window, about a minute, where `main` already shows the new version but the release has no assets yet. Daggerheart has the same window. To close it, set `"draft": true` with `"force-tag-creation": true` [S5 manifest-releaser.md] and publish with `gh release edit "$tag" --draft=false` after the upload. I left that out of the recommendation as not worth the extra step for now.

### Build provenance attestation

The permissions are `id-token: write` and `attestations: write`, plus `contents` [S6]. The step is:

```yaml
- uses: actions/attest@v4
  with:
    subject-path: |
      main.js
      manifest.json
      styles.css
```

**Gotcha for this repo.** GitHub says: "If you are on a GitHub Free, GitHub Pro, or GitHub Team plan, artifact attestations are only available for public repositories. To use artifact attestations in private or internal repositories, you must be on a GitHub Enterprise Cloud plan" [S6 gated-features]. `gotsanity/review-marks` is private. The recommended workflow therefore runs the attest step only when `github.event.repository.private` is false, so it starts working when the repo goes public. Obsidian has to download releases anyway, so the repo will likely be public by submission. [S8] mentions a private-source route through the Obsidian Community directory GitHub App, and that route is still unclear.

## 3. Conventional Commits enforcement

### What Daggerheart does

Nothing beyond the `CLAUDE.md` instruction: no commitlint, no hook, no PR-title check [S1].

### How commits drive versions [S5 `default.ts`, `filter-commits.ts`]

- A breaking change (`feat!:`, `fix!:` or a `BREAKING CHANGE:` footer) bumps major. Below 1.0.0 it still bumps major (0.x to 1.0.0) unless `bump-minor-pre-major: true`, in which case it bumps minor.
- `feat` bumps minor. Below 1.0.0 it bumps patch instead if `bump-patch-for-minor-pre-major: true`.
- Any other user-facing commit bumps patch.
- A `Release-As: x.y.z` footer, or `release-as` in the config, forces the version.
- `feat`, `fix`, `perf` and `revert` are visible in the changelog by default. `chore`, `docs`, `style`, `refactor`, `test`, `build` and `ci` are hidden. If every commit since the last release is hidden or non-conventional, release-please logs "No user facing commits found" and opens no PR [S5 `base.ts`]. Non-conventional commits are skipped silently.

### Options

1. **commitlint in CI on pull requests.** The setup is `@commitlint/cli` plus `@commitlint/config-conventional` with a `commitlint.config.mjs`, and a job that runs `npx commitlint --from <base.sha> --to <head.sha> --verbose` [S7 ci-setup.md]. commitlint ignores merge commits by default. This is the only option that holds without anyone installing anything locally, and it catches the "feat: merge development into master" mistake before it reaches the changelog.
2. **A local hook** (husky `commit-msg` running `npx --no -- commitlint --edit $1`) [S7 local-setup]. This gives faster feedback, but it adds a `prepare` script and a dev dependency, and `--no-verify` skips it.
3. **Neither, as in Daggerheart.** It costs nothing, and mistakes still land in the changelog.
4. **Lint PR titles only** (for example `amannn/action-semantic-pull-request`). This fits only if the repo is squash-merge only, so the PR title becomes the commit. `review-marks` currently allows merge, squash and rebase.

My take: use option 1. It's one job in the CI workflow and needs no secrets. Add the hook later if CI failures get annoying. One caveat: because commitlint in CI runs on PRs, it only bites if changes go through PRs rather than direct pushes to `main`.

## 4. Repo settings

Current `review-marks` settings (from `gh api repos/gotsanity/review-marks/actions/permissions/workflow`): `default_workflow_permissions: read`, `can_approve_pull_request_reviews: false`. Actions are enabled and all actions are allowed.

- **Workflow permissions.** Leave the default at read. Anyone with write access can raise GITHUB_TOKEN permissions with the workflow's `permissions:` key [S6 workflow-permissions-modifying]. The recommended workflows declare their own permissions: `contents: write`, `pull-requests: write` and `issues: write` for release-please (as in the README [S4]; `issues` is used for labels), and `contents: write`, `id-token: write` and `attestations: write` for the build-and-attest job. Obsidian's guide says to switch to "Read and write" [S2]. That's only needed for workflows that don't declare permissions.
- **Allow GitHub Actions to create and approve pull requests.** This must be on, or release-please can't open its PR [S4 "Workflow Permissions"; S6 managing-github-actions-settings]. It's currently off. One command turns it on:
  ```sh
  gh api -X PUT repos/gotsanity/review-marks/actions/permissions/workflow \
    -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
  ```
- **PAT: not needed.** Daggerheart uses plain GITHUB_TOKEN. Events created with GITHUB_TOKEN don't start new workflow runs [S6], which is why its `release: created` npm workflow never ran. In the recommended setup, build and upload run as a job in the same workflow, so that doesn't matter. CI on the release PR used to be the classic reason for a PR-scoped PAT [S4 "Other Actions on Release Please PRs"]. GitHub now creates `pull_request` runs for PRs opened by GITHUB_TOKEN in an approval-required state, and a user with write access clicks **Approve workflows to run** [S6 actions-do-not-trigger-workflows; enabled on github.com]. If CI is a required status check on `main`, that click is needed on each release PR. A fine-grained PAT, or a GitHub App token passed as `token:`, would remove the click at the cost of a secret to rotate.

## 5. Gotchas while the plugin isn't on `main` yet

- **Don't merge the workflow to `main` before the plugin.** release-please reads its config from the tip of the default branch. The node strategy requires `package.json` and throws `MissingRequiredFileError` without it [S5 `src/strategies/node.ts`]. Every push to `main` would fail until the plugin lands. Ship the pipeline files in the same PR that brings the plugin to `main`, or straight after it.
- **Bootstrap version.** `.release-please-manifest.json` = `{ ".": "0.0.0" }` plus `"initial-version": "0.1.0"` in the config. In the source, a manifest version of `0.0.0` counts as never released [S5 `src/manifest.ts`], and with no previous release release-please uses `initialReleaseVersion()`. That defaults to **1.0.0** unless `initial-version` is set [S5 `src/strategies/base.ts`]. `manifest-releaser.md` still says 0.1.0 is the node default, and the code says otherwise, so set it explicitly. Start `package.json` and `manifest.json` at `0.0.0`. The first release PR moves all three to `0.1.0`.
- **The first release PR needs a user-facing commit.** `main`'s existing commits ("Add sample review document and gitignore" and so on) aren't conventional, so release-please ignores them. No `bootstrap-sha` is needed. The commit or PR that lands the plugin should be a `feat:`, or no release PR will appear.
- **Pre-1.0 behaviour.** With `bump-minor-pre-major: true`, a stray `!` won't jump from 0.x to 1.0.0. Go to 1.0.0 on purpose with a `Release-As: 1.0.0` footer.
- **`versions.json`.** Start it as `{}`. The sync job adds `"0.1.0": "1.7.2"` on the first release PR. 1.7.2 is the `minAppVersion` floor recommended in `research/obsidian-versions.md` [S8].
- **`styles.css`.** Drop it from the attest and upload steps if the plugin ships without one. The prototype has one.
- **Branch flow.** Daggerheart uses `development → master`. `review-marks` has only `main`, so release-please watches `main`. If a `development` branch gets added later, nothing here changes.

## Recommended setup, file by file

You can commit everything below now on a branch, but merge it to `main` together with the plugin (see section 5).

### `.github/workflows/release-please.yml`

```yaml
name: release-please

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write
  issues: write

jobs:
  release-please:
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.release.outputs.release_created }}
      tag_name: ${{ steps.release.outputs.tag_name }}
      pr: ${{ steps.release.outputs.pr }}
    steps:
      # Manifest mode: reads release-please-config.json and .release-please-manifest.json.
      # Don't set release-type here; that switches manifest mode off.
      - uses: googleapis/release-please-action@v5
        id: release

  # Add "<version>": "<minAppVersion>" to versions.json on the open release PR.
  sync-versions-json:
    needs: release-please
    if: ${{ needs.release-please.outputs.pr != '' }}
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ fromJSON(needs.release-please.outputs.pr).headBranchName }}
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: node version-bump.mjs
      - name: Commit versions.json
        run: |
          if git diff --quiet -- versions.json; then
            echo "versions.json already up to date"
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add versions.json
          git commit -m "chore: update versions.json"
          git push

  # When the release PR merges: build, attest, attach assets.
  publish:
    needs: release-please
    if: ${{ needs.release-please.outputs.release_created == 'true' }}
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
      attestations: write
    env:
      TAG: ${{ needs.release-please.outputs.tag_name }}
    steps:
      - uses: actions/checkout@v7
        with:
          ref: ${{ needs.release-please.outputs.tag_name }}
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run build
      - name: Check manifest version matches tag
        run: test "$(node -p "require('./manifest.json').version")" = "$TAG"
      # Attestations need a public repo on Free/Pro/Team plans.
      - name: Generate artifact attestation
        if: ${{ !github.event.repository.private }}
        uses: actions/attest@v4
        with:
          subject-path: |
            main.js
            manifest.json
            styles.css
      - name: Upload release assets
        env:
          GH_TOKEN: ${{ github.token }}
        run: gh release upload "$TAG" main.js manifest.json styles.css --clobber
```

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint --if-present
      - run: npm run build

  commitlint:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx commitlint --from ${{ github.event.pull_request.base.sha }} --to ${{ github.event.pull_request.head.sha }} --verbose
```

Drop the `commitlint` job (and the two dev dependencies below) if you choose not to enforce.

### `release-please-config.json`

```json
{
  "$schema": "https://raw.githubusercontent.com/googleapis/release-please/main/schemas/config.json",
  "include-component-in-tag": false,
  "include-v-in-tag": false,
  "include-v-in-release-name": false,
  "bump-minor-pre-major": true,
  "packages": {
    ".": {
      "release-type": "node",
      "initial-version": "0.1.0",
      "changelog-path": "CHANGELOG.md",
      "extra-files": [
        { "type": "json", "path": "manifest.json", "jsonpath": "$.version" }
      ]
    }
  }
}
```

### `.release-please-manifest.json`

```json
{
  ".": "0.0.0"
}
```

### `version-bump.mjs`

Two uses: `npm version` (sets `npm_package_version`, as in the sample plugin) and CI (reads the version release-please already wrote to `manifest.json`).

```js
import { readFileSync, writeFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const targetVersion = process.env.npm_package_version ?? manifest.version;
const { minAppVersion } = manifest;

// Under `npm version`, also write the new version into manifest.json.
if (process.env.npm_package_version) {
	manifest.version = targetVersion;
	writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");
}

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
if (versions[targetVersion] !== minAppVersion) {
	versions[targetVersion] = minAppVersion;
	writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
}
```

### `versions.json`

```json
{}
```

### `manifest.json` (relevant fields)

```json
{
	"id": "review-marks",
	"name": "Review Marks",
	"version": "0.0.0",
	"minAppVersion": "1.7.2",
	"isDesktopOnly": false
}
```

### `package.json` (relevant fields)

```json
{
	"version": "0.0.0",
	"scripts": {
		"dev": "node esbuild.config.mjs",
		"build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
		"version": "node version-bump.mjs && git add manifest.json versions.json"
	},
	"devDependencies": {
		"@commitlint/cli": "^21",
		"@commitlint/config-conventional": "^21"
	}
}
```

`build` must be the production build, because Obsidian's scanner runs it [S8]. The `version` script keeps `npm version` working as a manual fallback. commitlint was at 21.2.4 when I checked.

### `commitlint.config.mjs`

```js
export default { extends: ["@commitlint/config-conventional"] };
```

`.mjs` files are on the Obsidian scanner's ignore list [S8].

### `.npmrc`

```
tag-version-prefix=""
```

Only matters if someone runs `npm version` by hand.

### `CLAUDE.md` addition

A short "Commits and releases" section: use Conventional Commits; `feat` gives minor, `fix` gives patch, `!` gives minor while below 1.0; write subjects as user-facing changelog lines; merging the release PR publishes.

### One-time repo setting

```sh
gh api -X PUT repos/gotsanity/review-marks/actions/permissions/workflow \
  -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
```

## Open questions

- Whether `release-please` returns the `pr` output when the release PR is unchanged. In that case the sync job doesn't run, but the earlier `versions.json` commit is still on the branch, so the result is the same. I haven't confirmed this against a live run.
- How the Obsidian scanner treats a private source repo with the Community directory GitHub App, and whether attestations are expected in that case [S8].
