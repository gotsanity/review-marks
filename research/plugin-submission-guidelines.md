# Obsidian community plugin guidelines and submission requirements

Research for issue #4. Sources checked on 2026-10-28 against the raw Markdown in
[obsidianmd/obsidian-developer-docs](https://github.com/obsidianmd/obsidian-developer-docs)
(the source behind docs.obsidian.md), [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases),
[obsidianmd/obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) and
[obsidianmd/eslint-plugin](https://github.com/obsidianmd/eslint-plugin).

## The process changed in 2026

**Submission no longer goes through a pull request to obsidian-releases.** You submit through
the Obsidian Community directory at community.obsidian.md, and an automated scanner reviews the plugin.

- Commit `d4f069442f` (2026-05-15, "remove PR templates & validation actions") deleted the
  plugin PR template and `validate-plugin-entry.yml` from obsidian-releases.
- `community-plugins.json` is now a mirror. The `mirror-community-json.yml` workflow pulls it
  every hour from `https://community.obsidian.md/assets/community-plugins.json`.
- Some first-party pages are out of date:
  - The obsidian-releases README still describes how entries are pulled from `community-plugins.json`.
  - The sample plugin README (line 46) still says "Make a pull request at obsidian-releases".
  - Treat the developer docs' `Community directory/` pages as the current source.

Sources: [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin),
[Set up and claim](https://docs.obsidian.md/community-directory/set-up-and-claim),
obsidian-releases commit history and `.github/workflows/mirror-community-json.yml`.

## Submission steps

From [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin) and
[Set up and claim](https://docs.obsidian.md/community-directory/set-up-and-claim):

1. The repo root must have `README.md`, `LICENSE` and `manifest.json`. The listing page shows
   an excerpt of the README.
2. Set `manifest.json` `version` to a semver `x.y.z` version, then create a GitHub release whose
   tag matches it exactly. Upload `main.js`, `manifest.json` and an optional `styles.css` as
   separate binary attachments. The old PR template added two details: use no `v` prefix, and
   attach the files individually, not only inside the source zip.
3. Sign in to community.obsidian.md with an Obsidian account and connect GitHub. The directory
   uses the GitHub connection to verify that you own the repo.
4. Under **Plugins → New plugin**, give the repo URL and the owner (yourself or an organization),
   agree to the Developer policies, and commit to keep supporting the plugin or to transfer or
   remove it. Then submit.
5. The directory reads `manifest.json` at HEAD of the default branch. Users download the
   files from the release whose tag equals `version`.
6. The automated review shows feedback in the directory. To fix a problem, update the repo and
   publish a release with a higher version number. The plugin can't be installed until all
   review **errors** are resolved. Warnings don't block it.

You submit only once. After that, publishing a new GitHub release is enough to update the plugin
([FAQ](https://docs.obsidian.md/community-directory/faq)).

## Automated review (scanner)

From [Manage your plugin or theme](https://docs.obsidian.md/community-directory/manage-entry) and the
[FAQ](https://docs.obsidian.md/community-directory/faq):

- **What it checks.** Results come in four sections: **Manifest**, **Releases**, **Source code**
  and **Build verification**. Build verification checks that the release build matches the
  committed source. Each result is rated Error, Warning, Recommendation or Pass.
- **Build script.** The scanner runs the first of `build`, `build:plugin` or `compile` that
  exists, so `build` must be the production build.
- **Ignored paths.** The scanner skips a fixed list of names, including `node_modules`, `dist`,
  `build`, `test`, `tests`, `__tests__`, `*.test.*`, `*.spec.*`, `mocks`, `scripts`, `docs`,
  `*.mjs`, `*.mts`, `*.cjs`, `*.cts`, `esbuild.config.mjs`, `version-bump.mjs` and locale folders
  (`i18n`, `locales`, `l10n`, ...). Test files with any other name get scanned.
- **Previews.** **Review branch** runs a preview scan on any branch, tag or SHA without a
  release. **Check for new releases** and **Request review** force a recheck.
- **License.** The license is read from GitHub. A "Custom license" result triggers a
  "no recognized license" warning.
- **Running it locally.** The FAQ says to install `eslint-plugin-obsidianmd` (see below) to run
  the review checks locally.
- **Release provenance.** A build provenance attestation is recommended. The
  [GitHub Actions release guide](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions)
  generates one with `actions/attest@v4`.
- **Private source.** Source can stay in a private repo if you install the Obsidian Community
  directory GitHub App on it. The scanner still checks that the release build matches the
  private source.

## Manifest fields

From [Manifest](https://docs.obsidian.md/Reference/Manifest):

| Field | Required | Notes |
| --- | --- | --- |
| `id` | yes | Lowercase letters and hyphens only. Can't end with `plugin` or contain `obsidian`. Must be unique across all published plugins. Can't be changed after publishing. |
| `name` | yes | Display name. Must be unique. See naming rules below. |
| `version` | yes | Semver `x.y.z`. Must equal the release tag. |
| `minAppVersion` | yes | Lowest Obsidian version the plugin supports. "If you don't know ... use the latest stable build number." |
| `description` | yes | See the description rules below. |
| `author` | yes | Author name. The old bot warned against putting an email address here. |
| `isDesktopOnly` | yes | Boolean. Must be `true` if the plugin uses Node.js or Electron APIs. |
| `authorUrl` | no | The old bot rejected values pointing at obsidian.md or at the plugin's own repo. |
| `fundingUrl` | no | A string, or an object mapping labels to URLs. Only for donation services. Remove it if you don't take donations. |

The ESLint `validate-manifest` rule (`lib/rules/validateManifest.ts`) treats exactly these 9 keys
as allowed. It flags any other key, duplicate keys and wrong types. The old bot also allowed
`helpUrl`; the current lint rule doesn't. For local development the `id` should match the plugin
folder name, or `onExternalSettingsChange` won't fire.

## Naming and ID rules

**Name** ([Manifest § name](https://docs.obsidian.md/Reference/Manifest)):

- Short and descriptive. English, Basic Latin characters only. The only punctuation allowed is
  hyphens, `+` and parentheses. No emoji.
- Don't use the word "Obsidian" or fragments like "Obsi-" or "-sidian".
- Don't include the word "Plugin".
- Don't use a core plugin or feature name on its own ("Live Preview" and "Bases" are the
  examples given).
- The name must be unique. No profanity.
- You can rename the plugin later by editing `name`. An invalid new name gets the plugin delisted
  until it's fixed.
- [Developer policies](https://docs.obsidian.md/community-directory/developer-policies): don't
  use the Obsidian trademark in a way that suggests a first-party product.

**ID**:

- Lowercase letters and hyphens. Can't contain `obsidian` or end with `plugin`.
- Must be unique. The old bot also blocked IDs of removed plugins.
- Fixed once published. Changing it means asking on Discord, and it resets downloads and forces
  every user to reinstall.

**Description** ([Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins)):

- Start with an action verb. Don't start with "This is a plugin".
- At most 250 characters. Ends with `.`.
- No emoji or special characters. Capitalize terms correctly ("Obsidian", "Markdown", "PDF").

The ESLint rule is stricter:

- Length 10–250 characters.
- Must start with a capital letter and end with `.`.
- Must match `^[A-Za-z0-9\s.,!?'"-]+$`.
- `name`, `description` and `id` must not contain `obsidian` or `plugin` (case-insensitive).

**For this project.** The directory has about 9,600 plugins. Names already taken include
"Annotate", "Inline Annotations", "Margin Annotations", "Annotations Everywhere",
"Review Comments", "Inline Review Comments", "Note Review Comments" and "Review Edit". The bare
ID `annotations` and the name "Annotations" were not taken as of this check. Pick something
distinctive and confirm it's free before the first release, because the ID can't change.

## Review guidelines

From [Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines). The page
says these are recommendations, "depending on their severity, we may still require you to
address" them. The matching ESLint rule is in brackets: ❌ = error in `recommended`, ⚠ = warning.

**DOM and security**

- Don't use `innerHTML`, `outerHTML` or `insertAdjacentHTML` with user input. Build elements
  with `createEl`, `createDiv` and `createSpan`, and clear them with `el.empty()`.
  [⚠ `prefer-create-el`]
- Don't inject `<style>` or `<link>` elements. Ship CSS in `styles.css`.
  [❌ `no-forbidden-elements`, `lib/rules/noForbiddenElements.ts`]
- Use `this.app`, not the global `app`.
- For popout windows, use `activeDocument` and `window.setTimeout`, and use `.instanceOf()`
  instead of `instanceof` on DOM nodes. [⚠ `prefer-window-timers`, `prefer-instanceof`,
  `no-global-this`]

**Styling**

- Don't hardcode inline styles (`el.style.color = ...`). Use CSS classes and Obsidian
  [CSS variables](https://docs.obsidian.md/Reference/CSS+variables/CSS+variables) so themes and
  snippets can override them. [❌ `no-static-styles-assignment`]

**Settings tab**

- Only add headings when there's more than one section. Keep general settings at the top with
  no heading. Don't put "settings" in heading text.
  [❌ `settings-tab/no-problematic-settings-headings`]
- Make headings with `new Setting(el).setName(...).setHeading()`, not `<h1>` or `<h2>`.
  [❌ `settings-tab/no-manual-html-headings`]
- Use sentence case for all UI text. [⚠ `ui/sentence-case`]
- Obsidian 1.13+: implement `getSettingDefinitions()` so settings show up in settings search, and
  refresh with `this.update()` instead of `display()`. These are lint-only; the guidelines page
  doesn't mention them yet. [⚠ `settings-tab/prefer-setting-definitions`,
  `prefer-update-over-display`, `require-display`]

**Commands**

- Don't set default hotkeys. [⚠ `commands/no-default-hotkeys`]
- Pick the right callback type. Use `callback` for commands that always run and `checkCallback`
  for conditional ones. Use `editorCallback` or `editorCheckCallback` when the command needs an
  active Markdown editor.
- Command IDs and names get the plugin ID as a prefix automatically. Don't repeat the plugin ID,
  the plugin name or the word "command" in them. This is a hard requirement on the Submission
  requirements page. [⚠ `commands/no-plugin-id-in-command-id`, `no-plugin-name-in-command-name`,
  `no-command-in-command-id`, `no-command-in-command-name`]

**Workspace and resources**

- Use `getActiveViewOfType()` or `workspace.activeEditor?.editor`, not `workspace.activeLeaf`.
- Don't keep references to custom views on the plugin. [❌ `no-view-references-in-plugin`]
- Clean up on unload with `registerEvent` and similar methods. Don't detach leaves in
  `onunload`. [❌ `detach-leaves`]
- After `registerEditorExtension`, reconfigure editor extensions by mutating the same array and
  calling `workspace.updateOptions()`.

**Vault and editing**

- For the active note, use the `Editor` API rather than `Vault.modify`. `Vault.modify` loses the
  cursor, selection and folds.
- For background edits, use `Vault.process`, which is atomic.
- Use `FileManager.processFrontMatter` for frontmatter.
- Prefer the Vault API to `vault.adapter`.
- Look files up with `getFileByPath` instead of iterating all files. [⚠ `vault/iterate`]
- Run user paths through `normalizePath()`.
- Don't hardcode `.obsidian`; use `Vault#configDir`. [⚠ `hardcoded-config-path`]
- Use `FileManager.trashFile()`. [⚠ `prefer-file-manager-trash-file`]

**General**

- Keep the console free of debug logging.
- Rename the sample class names (`MyPlugin`, `SampleSettingTab`) and remove all sample code,
  which is a hard requirement. [❌ `sample-names`, `no-sample-code`]
- Don't use APIs newer than `minAppVersion`. [❌ `no-unsupported-api`]
- Prefer `const`/`let` and `async`/`await`.

## isDesktopOnly and mobile

- `isDesktopOnly` is required. It **must** be `true` if the plugin uses Node.js or Electron APIs
  (`fs`, `crypto`, `os`, ...). Those APIs don't exist on mobile, and calling them, even from a
  dependency, can crash the plugin
  ([Submission requirements](https://docs.obsidian.md/community-directory/submission-requirements-for-plugins),
  [Mobile development](https://docs.obsidian.md/Plugins/Getting+started/Mobile+development)).
- Web alternatives the docs suggest: `SubtleCrypto` instead of `crypto`, and
  `navigator.clipboard` for the clipboard. The lint rule `no-nodejs-modules` allows Node imports
  only behind a `Platform.isDesktop` guard.
- Regex lookbehind needs iOS 16.4+. Avoid it or add a fallback. [❌ `regex-lookbehind`]
- Detect the platform with `Platform` (`Platform.isIosApp`, `isAndroidApp`, `isMobile`), not
  `navigator`. [❌ `platform`]
- Testing: `this.app.emulateMobile(true)` in desktop DevTools, `chrome://inspect` for Android,
  and Safari Web Inspector for iOS 16.4+.
- The old PR template asked authors to confirm testing on Windows, macOS and Linux, plus
  Android and iOS "if applicable". The listing accepts up to 5 mobile screenshots
  (900×1600) as well as desktop ones.

For this project, which must run on desktop and mobile: set `isDesktopOnly: false` and use no
Node.js or Electron APIs anywhere, dependencies included.

## Release and versioning

From [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin), the
sample plugin README and `version-bump.mjs`, and the obsidian-releases README:

- **Version format.** `version` is `x.y.z`. The old bot only allowed digits and dots, so
  pre-release suffixes are out. The release tag is the exact version with no `v`.
- **Files.** `manifest.json` lives both at the repo root and in the release. Release assets are
  `main.js`, `manifest.json` and the optional `styles.css`.
- **How the app picks a version.** Obsidian reads the root `manifest.json` (default branch HEAD)
  to find the latest version, then downloads the assets from the release with the matching tag.
- **`versions.json`.** Maps plugin version to `minAppVersion`. If the latest version needs a
  newer app than the user has, Obsidian uses `versions.json` to find the newest compatible older
  version. `npm version patch|minor|major` runs `version-bump.mjs`, which updates
  `manifest.json` and `versions.json`.
- **Automation.**
  [Release with GitHub Actions](https://docs.obsidian.md/Plugins/Releasing/Release+your+plugin+with+GitHub+Actions):
  pushing a tag builds the plugin, attests the assets and creates a draft release. The repo needs
  "Read and write" workflow permissions.
- **Beta testing.** Obsidian has no official beta channel. The docs recommend BRAT for testers
  ([Beta-testing plugins](https://docs.obsidian.md/Plugins/Releasing/Beta-testing+plugins)).
- **Lint in CI.** The sample plugin ships `eslint.config.mts` with
  `obsidianmd.configs.recommended` and a GitHub Action that runs `npm run lint` on every push.

## Developer policies

From [Developer policies](https://docs.obsidian.md/community-directory/developer-policies).
Breaking these gets a plugin removed from the directory.

**Not allowed**

- Obfuscated code.
- Dynamic ads loaded over the internet, or static ads outside the plugin's own UI.
- Client-side telemetry.
- Installing or updating itself or its dependencies.

**Allowed only if the README discloses it**

- Payment or an account required for full access.
- Network use, naming each remote service and why it's needed.
- Access to files outside the vault.
- Static ads inside the plugin's own UI.
- Server-side telemetry, with a link to a privacy policy.
- Closed source, decided case by case.

**Licensing**

- A `LICENSE` file is required.
- Respect the licenses of any code you include, with attribution in the README if required.
- Respect the Obsidian trademark.

**Forks**

- Not allowed unless the original author publicly approves, or the original author has been
  unreachable for 6+ months and gets 30 days' notice. The original author must be credited.

**Removal**

- Immediate removal for malware, an uncooperative developer or repeat violations.
- Unmaintained or badly broken plugins may also be removed.

## Common rejection reasons

Collected from the old validation bot's error list, the scanner sections and the
"must"/"required" items above:

1. The ID or name contains "obsidian" (or "Obsi-"/"-sidian"), the ID ends in `plugin` or the
   name contains "Plugin", or the ID or name is already taken.
2. The description is too long, doesn't end with a period, contains emoji, mentions "Obsidian",
   or starts with "This plugin...".
3. The manifest is missing a required key or has an unknown one. `version` isn't plain `x.y.z`.
   There's no release whose tag matches `version` exactly (a `v` prefix breaks it), or the
   release lacks `main.js` or `manifest.json` as individual assets.
4. There's no `LICENSE`, or GitHub can't recognize the license.
5. `fundingUrl` is left in without a donation link, or `authorUrl` is still the sample's
   obsidian.md value.
6. Sample code or sample class names are still in the plugin.
7. Node.js or Electron APIs are used while `isDesktopOnly` is `false`.
8. Command IDs or names repeat the plugin ID or name, or commands have default hotkeys.
9. The code uses `innerHTML`, inline styles, injected `<style>` or `<link>` elements, `<h1>`/`<h2>`
   settings headings, view references held on the plugin, or `detachLeavesOfType` in `onunload`.
10. A policy is broken: undisclosed network use, telemetry, obfuscation, or an unapproved fork.
11. Build verification fails because the release `main.js` doesn't match what `npm run build`
    produces from the committed source.

## Open questions

- The scanner's full rule set isn't published. The FAQ points to `eslint-plugin-obsidianmd` as
  the way to run the checks locally, but it doesn't say the two are identical.
- It's unclear whether a person still reviews new plugins after the automated scan passes. The
  docs say "Once we've reviewed and published your plugin" but describe only the automated
  review.
