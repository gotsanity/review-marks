# Obsidian versions and API stability

Research for issue #5. Checked 2026-10-28. Every claim cites the first-party source it came from.

## Sources

- [S1] Obsidian changelog: https://obsidian.md/changelog/ (index plus the per-release pages linked below)
- [S2] `desktop-releases.json` in obsidianmd/obsidian-releases (master): https://github.com/obsidianmd/obsidian-releases/blob/master/desktop-releases.json
- [S3] GitHub releases of obsidianmd/obsidian-releases (public installer builds): https://github.com/obsidianmd/obsidian-releases/releases
- [S4] `obsidian.d.ts` in obsidianmd/obsidian-api (master, package version 1.14.4): https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
- [S5] `CHANGELOG.md` in obsidianmd/obsidian-api: https://github.com/obsidianmd/obsidian-api/blob/master/CHANGELOG.md
- [S6] Manifest reference: https://docs.obsidian.md/Reference/Manifest
- [S7] obsidian-sample-plugin README ("Releasing new releases"): https://github.com/obsidianmd/obsidian-sample-plugin
- [S8] Help, "Update Obsidian": https://obsidian.md/help/updates
- [S9] Developer guide, deferred views: https://docs.obsidian.md/plugins/guides/defer-views
- [S10] `package.json` in obsidianmd/obsidian-api (master)

## 1. Current versions and release cadence

| Channel | Desktop | Mobile | Source |
|---|---|---|---|
| Public | **1.14.5** (2026-10-22; Electron 43.7.5 to 43.8.3 security bump only) | **1.14.4** (2026-10-05) | S1, S2 |
| Early access ("catalyst") | **1.15.0** (2026-10-22) | **1.15.0** (2026-10-22) | S1, S2 (`beta.latestVersion`) |

- `desktop-releases.json` says `latestVersion: 1.14.5`, `beta.latestVersion: 1.15.0`, `minimumVersion: 1.1.9`. In-app updates reach installs whose installer is 1.1.9 or newer; older installers have to be reinstalled [S2].
- **How 1.14 shipped** [S1]: early-access builds 1.14.0 (Sep 2), 1.14.1 (Sep 8), 1.14.2 (Sep 15), 1.14.3 (Sep 29) and 1.14.4 (Oct 1). 1.14.4 went public on desktop and mobile on Oct 5. Early access ran about 5 weeks with roughly weekly builds, and the public build is the last early-access build promoted unchanged.
- **Public minor lines** (first public tag on GitHub [S3]): 1.7 (2024-10-16), 1.8 (2025-01-30), 1.9 (2025-08-18), 1.10 (2025-11-11), 1.11 (2026-01-12), 1.12 (2026-02-27), 1.13 (2026-07-30), 1.14 (2026-10-05). That works out to a new public minor every 1.5 to 7 months, about 3 to 4 a year, followed by public patch releases (e.g. 1.13.4 to 1.13.8).
- Early-access builds are distributed from `releases.obsidian.md`, not as GitHub releases [S2]. The changelog labels them "Early access" and calls them catalyst builds [S1].
- Every public 1.x line ships on desktop and mobile at about the same time, with the same version number [S1].

## 2. How `minAppVersion` works

- `manifest.json` requires `minAppVersion` ("The minimum required Obsidian version") and `isDesktopOnly` [S6]. Because we target mobile, `isDesktopOnly` must be `false`, so the plugin can't use Node or Electron APIs [S6].
- `versions.json` maps each plugin version to its minimum app version, "so older versions of Obsidian can download an older version of your plugin that's compatible" [S7]. Raising `minAppVersion` later doesn't strand users on older apps. They stay on the last plugin release whose entry they satisfy.
- Obsidian downloads release assets from the GitHub release whose tag equals the manifest `version` [S7].
- At runtime, `requireApiVersion(version)` and the exported `apiVersion` let a plugin detect newer APIs and fall back on older ones [S4]. The obsidian-api changelog recommends checking that newer functions exist before calling them, to stay compatible with older app versions (the `SliderComponent#setInstant` note under v1.5.11) [S5].
- The npm package `obsidian` follows app versions: master is 1.14.4, with `@codemirror/state` 6.7.6 and `@codemirror/view` 6.43.13 as dependencies [S10]. Plugins mark CodeMirror as external and use the app's bundled copy at runtime. That matters for a CM6-heavy plugin: CM APIs newer than the bundled version in our `minAppVersion` would break on older apps.

## 3. API changes relevant to a review-markup plugin

The core APIs we need are old and stable. None has been changed or deprecated since 1.4 [S4]:

| API | `@since` | Notes |
|---|---|---|
| `Plugin#registerMarkdownPostProcessor` | 0.9.7 | Reading view |
| `Plugin#registerEditorExtension` | 0.12.8 | CM6 extensions for Live Preview / Source |
| `editorInfoField`, `editorLivePreviewField`, `editorEditorField` | no tag (public) | `editorViewField` is deprecated in favour of `editorInfoField` |
| `HoverPopover` | 0.15.0 | |
| `Plugin#registerHoverLinkSource` | 1.1.0 | Page-preview integration |
| `ItemView`, `registerView`, `getLeavesOfType`, `getRightLeaf` | 0.9.7 and earlier | Sidebar view |
| `Platform` | 0.12.2 | Desktop/mobile branching |

Newer additions that matter for this plugin, from `@since` tags [S4] and the API changelog [S5]:

- **1.4.4**: `setTooltip`. **1.4.11**: `TooltipOptions.delay`.
- **1.5.7**: `View.scope` made public (hotkeys scoped to our sidebar view), `getFrontMatterInfo`, `Vault#getFileByPath`, `Plugin#onExternalSettingsChange` (reload settings when Sync changes `data.json`).
- **1.6.6**: `WorkspaceMobileDrawer`, `FileManager#trashFile`, `CachedMetadata.footnotes`.
- **1.7.2** (largest workspace change): tabs are **deferred by default**. `WorkspaceLeaf#isDeferred` / `loadIfDeferred()`, `Workspace#ensureSideLeaf` made public, `Workspace#revealLeaf` now returns a Promise, and `Plugin#onUserEnable` was added (the docs say it is a good place to create a custom view once instead of in `onload`) [S5]. The deferred-views guide says `getLeavesOfType` results must be checked with `instanceof` before casting `leaf.view`. It also says to guard `loadIfDeferred` with `requireApiVersion('1.7.2')` and to use it sparingly [S9]. Housekeeping in the same release: `any` became `unknown` in many signatures, and `prepareQuery`/`fuzzySearch` were removed in favour of `prepareFuzzySearch` [S5].
- **1.8.7**: `displayTooltip`, `TooltipOptions.classes` / `gap`, `CachedMetadata.footnoteRefs`/`referenceLinks`, `App#loadLocalStorage`/`saveLocalStorage` (vault-scoped local storage).
- **1.10.0**: `App#isDarkMode()`, `RenderContext` (a `HoverParent`; added for Bases), `Modal#setCloseCallback`.
- **1.11.0**: `SettingGroup`, `Setting#addComponent`. **1.11.4**: `SecretStorage`.
- **1.13.0 to 1.13.2**: declarative settings (`PluginSettingTab#getSettingDefinitions`, `SettingDefinition*`, `SettingPage`), `ConfirmationModal`, `Setting#setErrorMessage`. These are preliminary and were reworked across 1.13.0 to 1.13.1 (commits "Improvements to the Settings API", "Remove CloseableComponent") [S4 history].
- **1.14.0 app change (not an API)**: highlights can carry a colour emoji (`==🔴 text==`) or a colour picked from a formatting submenu, and Live Preview shows a colour swatch when the cursor is in a highlight [S1, 1.14.0 desktop]. This overlaps directly with a review-markup syntax built on `==highlight==`. Math rendering moved from MathJax to Temml in both views [S1].
- **1.15.0 early access**: closing formatting tokens in Live Preview get `-end` classes (e.g. `cm-formatting-strong-end`). Selection of bold, italic and highlight markers in Live Preview was fixed, and page previews of headings that start with `---` were fixed [S1, 1.15.0 desktop]. CSS selectors that target CM formatting tokens may need updating.
- The obsidian-api `CHANGELOG.md` stops at v1.7.2 [S5]. For later versions, the `@since` tags and the changelog's "Developers" sections are the authoritative record.

## 4. How quickly users upgrade

- **No first-party adoption data exists.** Obsidian publishes no per-version usage numbers. `obsidian-releases` publishes plugin download stats, not app-version stats. Anything below is inferred from how updates are delivered.
- **Desktop**: if automatic updates are on, the app updates on restart. Users can turn this off in Settings → General [S8]. In-app updates can't replace Electron, so users must run a new installer from time to time [S8]. `minimumVersion: 1.1.9` means installers from Dec 2022 onward still receive app updates [S2, S3]. So most desktop users with default settings move to each new public release within days of restarting.
- **Mobile**: updates come through the device's app store [S8]. Speed depends on the user's app-store auto-update setting.
- **Laggards**: users with auto-update off, managed/offline machines, or mobile auto-update off. We have no numbers for them. The safe assumption is a long tail on older versions, which `versions.json` covers by serving them an older plugin release [S7].

## 5. Recommendation: `minAppVersion` range

**Recommended: `minAppVersion` between `1.7.2` and `1.8.7`. Default to `1.7.2`, and raise it to `1.8.7` only if we need `displayTooltip` / tooltip classes.**

| Choice | What we get | What it costs |
|---|---|---|
| **< 1.7.2** (e.g. 1.5.7) | Widest reach | We still have to handle deferred views on modern apps, plus guards and fallbacks for `ensureSideLeaf`, awaited `revealLeaf` and `onUserEnable`. Two code paths for the sidebar view, and an untested old path. Excluded users are those more than 2 years behind (1.7 went public 2024-10). |
| **1.7.2** (recommended floor) | Deferred-view APIs, `ensureSideLeaf`, awaited `revealLeaf`, `onUserEnable`, `View.scope`, `onExternalSettingsChange`, `setTooltip`. Covers everything the sidebar `ItemView`, hover and editor/post-processor work needs. | Excludes only apps that have been out of date for 2+ years. Little practical cost. |
| **1.8.7** | Adds `displayTooltip` (programmatic tooltips for annotation hovers), tooltip `classes`/`gap`, `footnoteRefs`/`referenceLinks`, vault-scoped local storage | Excludes apps from before Feb 2025 (about 20 months old). Small cost. |
| **1.10.0 to 1.11.x** | `isDarkMode()`, `Modal#setCloseCallback`, `SettingGroup`, `SecretStorage` | None of these is core to annotation work, and we drop roughly the last year of laggards. |
| **1.13.x to 1.14.x** | Declarative settings API, `ConfirmationModal`, and alignment with native coloured highlights (1.14) | Excludes anyone more than about 3 months (1.13) or about 3 weeks (1.14) behind, which includes mobile users who don't auto-update. The settings API is new and was reworked across patch releases. Only worth it if we deliberately build on 1.14's highlight colours. If we do, feature-detect instead of raising the floor. |

Other guidance:
- Pin the `obsidian` npm dev-dependency to the version used as `minAppVersion` (or type-check against it in CI). The current package's types would otherwise let 1.13/1.14-only APIs slip in unnoticed.
- Pin CodeMirror versions to the ones `obsidian` declares for that release [S10].
- Use `requireApiVersion` for any individual newer API rather than raising the floor [S4, S5].
- Watch out for the 1.14 highlight-colour syntax and the 1.15 `-end` formatting classes. Both change the Live Preview DOM and syntax our extension will run alongside.
