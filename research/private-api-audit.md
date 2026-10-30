# Private and fragile APIs in the B+ prototype

Research for issue #13. Checked 2026-10-30.

Question: which private or undocumented Obsidian APIs, `as any` casts and DOM-structure assumptions does the B+ prototype rely on? For each one: is there a public alternative, how likely is it to break across Obsidian versions, does `eslint-plugin-obsidianmd` flag it, and does it work at `minAppVersion` 1.7.2? Which ones should the real plugin replace, and which can it keep behind a guard?

## Sources and method

- **[PROTO]** Prototype source on `origin/prototype/storage-format` at `b78ffbf`, `prototypes/storage-format/plugins/review-marks/src/` (all 14 files read). File:line references below point there.
- **[D172]** `obsidian.d.ts` from the npm package `obsidian@1.7.2`, which the real plugin pins.
- **[D1144]** `obsidian.d.ts` from `obsidian@1.14.4` (latest), which carries the `@since` tags.
- **[LINT]** `eslint-plugin-obsidianmd` 0.4.2 with the skeleton's `eslint.config.mts` (`obsidianmd.configs.recommended`), from `origin/ci/release-pipeline` at `ab5405e`. The skeleton is on that branch, not yet on `main`.
- **[TSC]** `tsc --noEmit` with the skeleton's `tsconfig.json` against `obsidian@1.7.2`.
- **[CM]** `CHANGELOG.md` of `@codemirror/view` and `@codemirror/state` as installed by the skeleton's lockfile (view 6.38.6, state 6.5.0).
- **[DOCS]** obsidian-developer-docs source: `Plugins/Editor/Communicating with editor extensions.md` and `Plugins/Getting started/Mobile development.md`.
- Earlier research: `research/obsidian-editor-api.md` (#2), `research/plugin-submission-guidelines.md` (#4), `research/obsidian-versions.md` (#5).

How the checks were run:

1. The prototype `src/` was copied into a scratch copy of the skeleton (`package.json`, lockfile, `tsconfig.json`, `eslint.config.mts`, `manifest.json` with `minAppVersion` 1.7.2). `npx eslint src` gave 49 problems (24 errors, 25 warnings). The findings below quote only the ones that touch this audit.
2. `tsc --noEmit` against `obsidian@1.7.2`. Apart from `noUncheckedIndexedAccess` errors, which the skeleton turns on and the prototype was never written for, it reported **no missing member or export**. Every typed Obsidian API the prototype calls exists in the 1.7.2 typings, including `setCssProps`, `View.scope`, `rightSplit`, `rootSplit`, `getMostRecentLeaf`, `revealLeaf` (returns a Promise), `previewMode.rerender`, `applyScroll`, `getSectionInfo`, `editorInfoField`, `editorLivePreviewField`, `MarkdownRenderer.render` and `Vault.process`.
3. ESLint again with `obsidian@1.14.4` swapped in, so that `obsidianmd/no-unsupported-api` could compare its `@since` tags with `minAppVersion` 1.7.2. It reported nothing.

**Process finding.** `no-unsupported-api` builds its version map from `@since` tags in whichever `obsidian.d.ts` is installed [LINT `noUnsupportedApi.js`]. The 1.7.2 typings carry only 2 `@since` tags, against 869 in 1.14.4. With the dev dependency pinned to 1.7.2, the rule does almost nothing. Type-checking against the pinned typings is what actually catches APIs newer than 1.7.2. Keep the pin and keep `tsc` in CI.

None of the checks above can see untyped internals (`editor.cm`, `renderer.sections`) or DOM class names. "Works at 1.7.2" for those is **unverified** until someone runs them in a 1.7.2 sandbox vault.

## Summary

| # | Item | Where [PROTO] | Kind | Public alternative | Break risk | Lint flags it | At 1.7.2 | Recommendation |
|---|---|---|---|---|---|---|---|---|
| 1 | `editor.cm` (CM6 `EditorView`) | comment-box.ts:16-17, drag.ts:52-53, render-live.ts:210-211, sidebar.ts:390-391, convert.ts:133 | Untyped property, documented in docs | Partly: a ViewPlugin-held registry, `editorEditorField` | Low | Indirectly, 2 of 5 sites | Unverified (untyped); docs have described it for years | Keep behind a guard (one helper) |
| 2 | `previewMode.renderer.sections` | drag.ts:190-205 | Private | Yes: `ctx.getSectionInfo(el)` kept per section | High | Yes (`no-unsafe-member-access`, error) | Unverified | Replace |
| 3 | `previewMode.applyScroll(line)` | sidebar.ts:410-413 | Public method; unit undocumented | `setEphemeralState({ line })` (untyped); `el.scrollIntoView` | Medium | No | Yes (typed in 1.7.2) | Keep behind a guard |
| 4 | Live Preview table-widget DOM | render-live.ts:135-201, drag.ts:110-111, 175-188, sidebar.ts:400-405 | DOM structure | None | High | No | Unverified | Keep behind a guard, or drop (decision) |
| 5 | Reading view rendered-HTML shape and class names | render-dom.ts:12-13, 30-122; dom-map.ts:13-15; drag.ts:100 | DOM structure | Partly: post processor plus `getSectionInfo` | Medium | No | Unverified | Keep behind a guard |
| 6 | Footnote list DOM in Reading view | render-reading.ts:56-84 | DOM structure | None for hiding; `CachedMetadata.footnotes` (1.6.6) for data | Medium | No | Unverified | Keep behind a guard (fail open) |
| 7 | Reading to Live Preview via view-state keys `mode`/`source` | drag.ts:211 | Undocumented state shape | None typed | Low to medium | No | Yes (typed as `Record<string, unknown>`) | Keep behind a guard |
| 8 | Focus-transaction workaround and focus timers | render-live.ts:21-54, sidebar.ts:394-408 | Public CM6; relies on timing | Public already (`focusChangeEffect`, `hasFocus`) | Medium | No | Depends on bundled CM ≥ 6.9.0 | Keep, behind a feature check |
| 9 | History grouping through custom `userEvent` and `addToHistory(false)` | comment-box.ts:82, 182, 201-203; backspace.ts:45; convert.ts:136 | Public CM6; relies on history's join rule | `isolateHistory` (`@codemirror/commands`) | Low | No | Unverified (bundled CM) | Replace the `userEvent` trick |
| 10 | `EditorView.scrollSnapshot` | comment-box.ts:39-45, convert.ts:134-136 | Public CM6, needs view ≥ 6.22.0 | None needed | Low | No | Unverified (bundled CM) | Keep behind a guard (already in convert.ts) |
| 11 | `window as any` for the CSS Custom Highlight API | drag.ts:143-169 | `as any` cast | Yes: typed `CSS.highlights` / `Highlight` in TS lib.dom | Low | Yes (12 errors) | Not an Obsidian API | Replace |
| 12 | `document.caretRangeFromPoint` | drag.ts:138-141 | Non-standard DOM API | `caretPositionFromPoint` | Low | Yes (`no-deprecated`, warning) | Not an Obsidian API | Keep behind a guard (try the standard first) |
| 13 | `app.emulateMobile` | Not in the source | Untyped, documented for testing | n/a | n/a | n/a | n/a | Drop from code; keep as a manual test step |
| 14 | Main-window-only DOM (`document`, `window`, `instanceof`) | comment-box.ts:96, 123-127; ui.ts:27; drag.ts:35-39; render-reading.ts:61, 77 | Popout-window assumption | `activeDocument`, `el.doc`, `.instanceOf()` | Low | Partly (`prefer-instanceof`, warning) | Yes | Replace |
| 15 | Regex lookbehind | dom-map.ts:57, 64 | iOS < 16.4 incompatibility | Rewrite without lookbehind | Low (old iOS only) | **No, because of a rule bug** | Not an Obsidian API | Replace |

"Break risk" is the chance that a future Obsidian release breaks it without notice. Items 13 to 15 are not private APIs. They are listed because they are fragile in the same way, or because the audit turned them up.

## 1. `editor.cm`: reaching the CodeMirror `EditorView`

**What.** Five places reach the CM6 view behind Obsidian's `Editor`:

- `cmOf(editor)` in comment-box.ts:16-17 and `cmOf(view)` in drag.ts:52-53, both with `@ts-expect-error`;
- render-live.ts:210-211 and sidebar.ts:390-391, also with `@ts-expect-error`;
- convert.ts:133, as `(editor as unknown as { cm?: EditorView }).cm`.

The prototype uses the view to dispatch effects (`refreshEffect`, `setDrag`), to dispatch changes outside history, for `scrollSnapshot`, `posAtCoords`, `coordsAtPos`, `posAtDOM`, `scrollDOM` and `focus()`.

**Public alternative.** Partial.

- Obsidian exports `editorEditorField: StateField<EditorView>` [D172 line 1257], but that only helps code already running inside a CM extension.
- From outside, the official docs give exactly the pattern the prototype uses: `// @ts-expect-error, not typed` / `const editorView = view.editor.cm as EditorView;` [DOCS Communicating with editor extensions].
- A fully public route is possible. One of our own `ViewPlugin`s receives every `EditorView` in its constructor, and `view.state.field(editorInfoField)` gives the owning `MarkdownFileInfo`. A `Map<MarkdownFileInfo, EditorView>` kept by that ViewPlugin finds the view for a `MarkdownView` without touching `.cm`. Caveat (**Inference**): table cells run their own nested CM editors, which would also register. Filter out any view whose `dom` sits inside `.cm-table-widget`.

**Risk.** Low. The docs have recommended this since the CM6 switch, and the plugin ecosystem leans on it heavily (Commentator calls `editor.cm` throughout; see #2 research).

**Lint.**

- Two sites are flagged, and only indirectly: comment-box.ts:17 and drag.ts:53 return the `@ts-expect-error` value, which gives `@typescript-eslint/no-unsafe-return` ("Unsafe return of a value of type error", error).
- The casts at sidebar.ts:391, render-live.ts:211 and convert.ts:133 pass cleanly.
- `@typescript-eslint/ban-ts-comment` is off in the recommended config [LINT `index.js`].

**At 1.7.2.** Not in the typings, so it can't be checked statically. The docs pattern predates 1.7.2. **Unverified** until it is run in a 1.7.2 vault.

**Recommendation: keep behind a guard.** Put all access behind one `editorViewOf(editor): EditorView | undefined` helper that tries `.cm` and checks `instanceof EditorView`. Every caller should already have a fallback for `undefined`. comment-box.ts does (`createAnnotation` without the provisional step) and convert.ts does (`editor.transaction`), but drag.ts:53 and sidebar.ts:391 assume the value exists. Optionally add the ViewPlugin registry as the first lookup.

## 2. `previewMode.renderer.sections`

**What.** drag.ts:190-205 reads the private renderer's section list (`{ el, start: { line }, end: { line } }`). It uses the list to map a DOM selection in Reading view back to source offsets for annotate-on-drag. The cast is commented `@ts-expect-error private API`.

**Public alternative. Yes.** The registered post processor already receives each section's `el` and its `MarkdownPostProcessorContext` (render-reading.ts:39-55). `ctx.getSectionInfo(el)` returns `{ text, lineStart, lineEnd }` [D172 line 2392], and the docs say to call it just before you need it [#2 research]. Keep a `WeakMap<HTMLElement, MarkdownPostProcessorContext>` filled by the post processor. At drag time, collect the connected elements under `.markdown-preview-view` that are in the map, and call `getSectionInfo` on each. **Inference, to verify:** the `el` given to a post processor in Reading view is the same element the renderer keeps per section, so the map covers every rendered block. Blocks never handed to a post processor (none are expected) would just be unselectable.

**Risk. High.** The member is untyped, undocumented and has no compatibility promise. Its field names (`start.line`, `end.line`) are internal.

**Lint. Yes:** `@typescript-eslint/no-unsafe-member-access` ("Unsafe member access .sections on a type that cannot be resolved", error) at drag.ts:196.

**At 1.7.2.** Unverified.

**Recommendation: replace** with the `getSectionInfo` map above.

## 3. `previewMode.applyScroll(line)`

**What.** sidebar.ts:410-413 scrolls Reading view to a source line with `view.previewMode.applyScroll(line - 2)`. It then waits for the lazily rendered Target and calls `scrollIntoView` on it (`flashInPreview`, sidebar.ts:419-426).

**Correction to the ticket.** `applyScroll` is not private. `MarkdownPreviewView.applyScroll(scroll: number)` and `getScroll()` are `@public` in both 1.7.2 and 1.14.4 [D172 lines 2462, 2535; D1144 lines 6000-6015]. What is undocumented is the **unit**: the typings call it only "the scroll position". The prototype relies on it being a source line number in Reading view.

**Public alternative.**

- `leaf.setEphemeralState({ line })` is the conventional route, but its parameter is `unknown`/`any` [D172 line 4529], so it is no more documented.
- `el.scrollIntoView()` on the decorated Target is fully public, and the prototype already does it as the second step. It only fails when the Target's section has not been rendered yet, which is why the line scroll comes first.

**Risk. Medium.** The method will stay, but the meaning of the number could change without a type change.

**Lint.** No. It is a typed public member.

**At 1.7.2.** Yes, it is typed in the 1.7.2 typings.

**Recommendation: keep behind a guard.** After `applyScroll`, keep the `scrollIntoView` step as the real positioning. If the Target element still can't be found after the retries, show a Notice instead of failing silently.

## 4. Live Preview table-widget DOM

**What.** Obsidian draws Markdown tables in Live Preview as a widget. CM decorations can't reach inside it, and post processors don't run there (render-live.ts:135-137). The prototype depends on all of the following:

- the class `.cm-table-widget` (render-live.ts:174, 213; drag.ts:110; sidebar.ts:404; render-live.ts:116);
- `table tr` rows in the same order as the source lines, with the `|---|` line skipped (render-live.ts:178-184);
- `td` children in source cell order, with content inside `.table-cell-wrapper` (render-live.ts:189-191);
- an active cell being a nested `.cm-editor` (render-live.ts:192; render-dom.ts:12);
- the drag handles `.table-row-drag-handle` and `.table-col-drag-handle` (render-dom.ts:13; dom-map.ts:14);
- a footnote reference inside a cell rendering as plain text `r8` rather than a `sup` (render-dom.ts:72, render-live.ts:136);
- a selection inside the widget opening a cell editor (drag.ts:135-136), which is why drag uses a Highlight;
- moving the cursor into a cell swapping editors asynchronously, handled with 50 ms and 150 ms timers (sidebar.ts:400-408).

`view.posAtDOM(widget)` itself is public CM.

**Public alternative. None.** Obsidian has no API for the table widget's contents. The only fully public option is to not decorate inside tables: show the raw `{…}[^rN]` there and still list the Annotation in the sidebar.

**Risk. High.** This is undocumented UI structure. The table editor is an actively changing area (row and column drag handles are a later addition).

**Lint.** No. Selectors are strings.

**At 1.7.2.** **Unverified.** Whether `.table-cell-wrapper` and the drag-handle classes exist in 1.7.2 needs checking in a 1.7.2 vault. The code already falls back to `td` when `.table-cell-wrapper` is missing.

**Recommendation: keep behind a guard, or drop (decision for the user).** If kept:

- Check the structure before decorating: row count equals source table lines minus one, and cell count equals `splitCells` length. On any mismatch, leave the cell untouched so the raw syntax shows.
- Never throw.
- Keep the table path in its own module, so it can be switched off in a hotfix if Obsidian changes the widget.

Drag-to-annotate inside tables can go behind the same guard.

## 5. Reading view rendered-HTML shape and class names

**What.**

- render-dom.ts assumes Obsidian renders `{` and `}` as literal text, so that the n-th brace in source is the n-th brace in the DOM. It also assumes `[^rN]` renders as a `<sup>` that is the **next sibling** of the text node ending in `}` (render-dom.ts:74-78).
- Both render-dom.ts:12-13 and dom-map.ts:13-15 keep skip-lists of Obsidian class names:
  - `sup.footnote-ref`, `.footnotes`, `section.footnotes`
  - `.frontmatter`, `.metadata-container`
  - `.internal-embed`, `.math`, `.copy-code-button`
  - `.markdown-preview-pusher`, `.mod-header`, `.mod-footer`, `.embedded-backlinks`
- drag.ts:100 requires `.markdown-reading-view .markdown-preview-view`, and drag.ts:96 skips `.markdown-embed`.

**Public alternative. Partial.** Post processors plus `getSectionInfo` are the public way to decorate Reading view, and the prototype uses them. The text-to-DOM alignment and the skip-lists have no public replacement. Obsidian publishes no DOM contract for rendered Markdown.

**Risk. Medium.** Brace-as-text is a Markdown rule and safe. The `sup` sibling and the class names have changed before:

- `.metadata-container` arrived with Properties.
- Math moved from MathJax to Temml in 1.14.0 (#5 research), which changes what `.math` contains.
- 1.15.0 early access adds `-end` classes to CM formatting tokens (#5 research). Those are Live Preview, not Reading view, but they show the DOM keeps moving.

A renamed class makes the walk include text it should skip, and the brace alignment then fails.

**Lint.** No. There is one unrelated warning in this area: `obsidianmd/prefer-create-el` for `document.createDocumentFragment()` at render-dom.ts:94.

**At 1.7.2.** Unverified for each class.

**Recommendation: keep behind a guard.** The prototype already stops aligning at the first brace mismatch (render-dom.ts:54-56). Make that fail closed: if the brace count differs, leave the section undecorated rather than decorating part of it. Keep the class list in one shared constant, and add a smoke test (a fixture note with a frontmatter block, math, an embed, a footnote and a table) to run in each Obsidian version we support.

## 6. Footnote list DOM in Reading view

**What.** render-reading.ts:56-84 finds Obsidian's footnote list (`section.footnotes`, items `li[id^="fn-"]`). It assumes the number in `fn-N` follows first-reference order, matching `footnoteOrder()` in parse.ts:216-229, and uses that to tag and hide review items (`[^rN]`) and renumber the rest (`li.value`). The fallback path for elements with no section info reads `sup.footnote-ref a[data-footref]` (render-reading.ts:58-59), and assumes the `}` is the last character of the previous text node (render-reading.ts:64).

**Public alternative. None for the DOM.** `CachedMetadata.footnotes` (`@since` 1.6.6) gives footnote definitions with positions, and `footnoteRefs` (1.8.7) gives the references [#5 research]. Neither says which rendered `li` is which. At 1.7.2 only `footnotes` is available, and the prototype's own parser already covers it.

**Risk. Medium.** The `fn-` id scheme and the `data-footref` attribute are internal. The regex `^fn-(\d+)` tolerates suffixes, but a change to the numbering rule would mislabel items.

**Lint.** No. There are two `obsidianmd/prefer-instanceof` warnings at render-reading.ts:61 and 77 (see item 14).

**At 1.7.2.** Unverified.

**Recommendation: keep behind a guard and fail open.** Only hide an item when its rendered text matches the Comment the parser expects for that label. If anything disagrees, hide nothing. Showing review footnotes is harmless; hiding a real footnote is not.

## 7. Switching Reading view to Live Preview through view state

**What.** drag.ts:211 calls `view.leaf.setViewState({ type: 'markdown', state: { ...view.getState(), mode: 'source', source: false } })`.

**Public alternative. None typed.** `getState()` returns `Record<string, unknown>` [D172 line 1728], so the `mode`/`source` keys are undocumented. Running the `markdown:toggle-preview` command by id is also undocumented, and it toggles rather than sets the mode.

**Risk. Low to medium.** Many plugins use these keys, so a change would break a lot of the ecosystem. Still, nothing promises them.

**Lint.** No.

**At 1.7.2.** The call is typed and compiles.

**Recommendation: keep behind a guard.** After the switch, check `view.getMode() === 'source'` and that `editorLivePreviewField` is true. If either check fails, show a Notice ("switch to Live Preview to annotate") instead of going on.

## 8. Focus-transaction workaround

**What.** render-live.ts:21-54 tracks focus with `EditorView.focusChangeEffect`. It also has a ViewPlugin that, after every update and on `focus`/`blur` (deferred with `setTimeout(0)` and a microtask), compares the field with `view.hasFocus` and dispatches a correction. The comment explains why:

- CM drops its focus transaction when another one lands first (`focus()` then `setCursor()`);
- an editor focused before the plugin loads gets no focus event;
- a table cell editor stays alive after a click elsewhere.

sidebar.ts:394-408 adds `cm.focus()` instead of `editor.focus()` (which "focuses the active CM, which can be a table cell's editor that is already gone"), plus 50 ms and 150 ms timers.

**Public alternative.** These are already public CM APIs: `focusChangeEffect` and `hasFocus` [CM]. What is fragile is the reliance on timing and on Obsidian's table-cell editor lifecycle, not the API itself.

**Risk. Medium.** Timing and editor-swap behaviour can change in any release without a type change. The cost of failure is cosmetic (syntax revealed or hidden at the wrong time).

**Lint.** No.

**At 1.7.2.** `focusChangeEffect` was added in `@codemirror/view` 6.9.0 (2023-02-15) [CM]. Obsidian does not publish which CM version it bundles. The `obsidian@1.7.2` package lists only `^6.0.0` peers, and the first package that pins CM versions is 1.10.0 (view 6.38.1). The 1.7.2 app (2024-09) very likely bundles view ≥ 6.9, but this is **unverified**. Check it in a 1.7.2 vault with `typeof app.workspace.activeEditor.editor.cm.constructor.focusChangeEffect`.

**Recommendation: keep**, with `focusChangeEffect` behind an existence check. Replace the fixed timers in sidebar.ts with a wait for the next `update` in which `view.hasFocus` settles.

## 9. Undo-history grouping through custom `userEvent`

**What.** comment-box.ts writes a provisional Annotation with `Transaction.addToHistory.of(false)` (lines 82, 182, 201). It then dispatches the final edit with `userEvent: 'input.annotate'` "so history never joins it with the typing before it" (lines 202-203). backspace.ts:45 does the same with `'input.unwrap'`. This depends on CM's history only joining events whose `userEvent` matches `input.type` or `delete`, an internal detail of `@codemirror/commands`' history.

**Public alternative. Yes:** `isolateHistory.of('full')` from `@codemirror/commands` is the documented annotation for "don't join this transaction with its neighbours". The Obsidian sample plugin's esbuild config lists `@codemirror/commands` as external, so the app's copy would be used. **Inference:** the `obsidian` package doesn't list it, so it would be a new dev dependency for types only.

**Risk. Low.** The join rule has been stable, but it is an implementation detail.

**Lint.** No.

**At 1.7.2.** `Transaction.addToHistory` and `userEvent` are old CM APIs. `isolateHistory` is exported by `@codemirror/commands` 6.0.0 (checked in that package's `index.d.ts`), so any CM6 build has it.

**Recommendation: replace** the custom-`userEvent` trick with `isolateHistory`. Keep `addToHistory.of(false)` for the provisional write, because that is its documented purpose.

## 10. `EditorView.scrollSnapshot`

**What.** comment-box.ts:39-45 (`keepScroll`) and convert.ts:134-136 use `cm.scrollSnapshot()` so that edits don't scroll the note.

**Public alternative.** None needed; it is public CM.

**Risk. Low.**

**Lint.** No.

**At 1.7.2.** Added in `@codemirror/view` 6.22.0 (2023-11-03) [CM]. The bundled CM version at 1.7.2 is unpublished (see item 8), so this is **unverified**. convert.ts already checks `typeof cm.scrollSnapshot === 'function'`; comment-box.ts does not.

**Recommendation: keep behind a guard.** Use the convert.ts check in `keepScroll` too.

## 11. `window as any` for the CSS Custom Highlight API

**What.** drag.ts:143-169 casts `window` to `any` to reach `CSS.highlights` and `Highlight`, which draw the drag range without moving the real selection. It falls back to the real selection when they are missing.

**Public alternative. Yes.** TypeScript 5.9's `lib.dom.d.ts` types both `Highlight` and `CSS.highlights: HighlightRegistry`, so no cast is needed. Write `if ('highlights' in CSS) CSS.highlights.set('rm-drag', new Highlight(range))`.

**Risk. Low.** It is a web standard. The runtime guard covers older WebViews (Chromium 105+, Safari 17.2+; **unverified** for the exact mobile WebView floors).

**Lint. Yes, 12 errors:**

- `eslint-comments/no-restricted-disable`: disabling `@typescript-eslint/no-explicit-any` is not allowed, which means the scanner won't accept a suppression either;
- `eslint-comments/require-description`;
- a series of `no-unsafe-assignment`, `no-unsafe-member-access` and `no-unsafe-call` errors.

**At 1.7.2.** Not an Obsidian API.

**Recommendation: replace** with the typed version.

## 12. `document.caretRangeFromPoint`

**What.** drag.ts:138-141 turns pointer coordinates into a DOM position for drag in Reading view and in tables.

**Public alternative.** `document.caretPositionFromPoint` is the standard. TypeScript marks `caretRangeFromPoint` deprecated. Support for `caretPositionFromPoint` in Chromium and WebKit is recent (**unverified** for the Electron and mobile WebView versions Obsidian 1.7.2 shipped).

**Risk. Low.** The non-standard method is still in Chromium and WebKit, which are the engines Obsidian runs on.

**Lint. Yes:** `@typescript-eslint/no-deprecated` (warning). Suppressing it is a restricted disable.

**At 1.7.2.** Not an Obsidian API.

**Recommendation: keep behind a guard.** Try `caretPositionFromPoint` first and fall back to `caretRangeFromPoint` through a feature check, so the deprecated call only runs where it is needed.

## 13. `app.emulateMobile`

**What.** It is **not in the prototype source**. The ticket lists it as a testing aid. It is not in the typings at 1.7.2 or 1.14.4, but the developer docs give `this.app.emulateMobile(true)` and `this.app.emulateMobile(!this.app.isMobile)` for testing [DOCS Mobile development].

**Recommendation: drop from code.** Never ship a call to it. Use it from the DevTools console as a manual test step, and note that it does not reproduce iOS WebKit (see item 15).

## 14. Main-window-only DOM

**What.**

- The comment box and the popover attach to `document.body` (comment-box.ts:96, ui.ts:27).
- Listeners go on the global `document` and `window` (comment-box.ts:123-127; drag.ts:35-39 through `registerDomEvent(window, …)`).
- DOM type checks use `instanceof HTMLElement` and `instanceof HTMLLIElement` (render-reading.ts:61, 77).

In a popout window, the box and popover would open in the main window, and `instanceof` fails across windows.

**Public alternative.** `activeDocument` / `activeWindow`, `el.doc` / `el.win`, and `Node.instanceOf()`, all public helpers in the typings.

**Risk. Low.** Popouts are a desktop-only edge case. This breaks for users today rather than in some future version.

**Lint. Partly:** `obsidianmd/prefer-instanceof` (warning) at render-reading.ts:61 and 77. `prefer-active-doc` is **off** in the recommended config [LINT `index.js`], so the `document.body` uses are not flagged.

**Recommendation: replace.**

## 15. Regex lookbehind, and a lint-rule bug

**What.** dom-map.ts:57 (`/(?<!!)\[\[…/`) and dom-map.ts:64 (`/(?<![!\]])\[…/`) use negative lookbehind. Lookbehind needs iOS 16.4 or later (#4 research).

**Lint. Not flagged, because of a bug in the rule.** `obsidianmd/regex-lookbehind` (error) tests regex literals with `/\(\?<=|\(\?<!\)/`. The second alternative only matches the literal text `(?<!)`, so a real negative lookbehind like `(?<!!)` gets through [LINT `regexLookbehind.js`]. The scanner may share the bug.

**Recommendation: replace** with a forward scan that checks the previous character by hand. Optionally report the rule bug upstream to obsidianmd/eslint-plugin.

## Not issues

These looked suspect but are public and typed at 1.7.2:

- `previewMode.rerender(true)`;
- `getSectionInfo`;
- `editorInfoField` and `editorLivePreviewField`;
- `View.scope` with `new Scope(this.app.scope)` (`@since` 1.5.7);
- `workspace.rightSplit.collapse()`, `rootSplit`, `getMostRecentLeaf` (`@since` 0.15.4) and `leaf.getRoot()`;
- `revealLeaf` (a Promise since 1.7.2);
- `setCssProps`, `createSpan` and `isShown`;
- `MarkdownRenderer.render` and `Vault.process`.

`app.plugins.plugins[...]` appears only in a comment (main.ts:30).

For opening the sidebar, `workspace.ensureSideLeaf` (`@since` 1.7.2) [D1144 line 10926] could replace the hand-rolled `getRightLeaf` / `setViewState` / `revealLeaf` sequence (sidebar.ts:21-27). That is a simplification, not a fix.

## Recommendations

| Action | Items |
|---|---|
| **Replace** | 2 (`renderer.sections` → `getSectionInfo` map), 9 (`userEvent` trick → `isolateHistory`), 11 (typed Highlight API), 14 (popout-safe DOM), 15 (no lookbehind) |
| **Keep behind a guard** | 1 (`editor.cm` through one helper), 3 (`applyScroll` with `scrollIntoView` fallback), 4 (table widget, structure-checked; or drop), 5 (fail-closed brace alignment), 6 (fail-open footnote hiding), 7 (verify mode after switch), 8 (`focusChangeEffect` existence check, no fixed timers), 10 (`scrollSnapshot` check), 12 (standard caret API first) |
| **Drop** | 13 (`emulateMobile` stays out of shipped code) |

Before the real plugin depends on any guarded item, run one check in an Obsidian **1.7.2** sandbox vault. Confirm `editor.cm`, the bundled CM version (`focusChangeEffect`, `scrollSnapshot`), the table-widget classes (`.cm-table-widget`, `.table-cell-wrapper`, drag handles), and the Reading view and footnote classes in items 5 and 6.

## Open questions

- **Tables.** Should Live Preview tables get decorated Annotations at all? Table support accounts for most of the high-risk DOM coupling (item 4). Dropping it means Annotations in tables show as raw syntax in Live Preview but still work in Reading view and the sidebar.
- **Drag from Reading view.** Is it in scope for v1? It needs items 2, 5, 7 and 12. The command and sidebar paths need none of them.
- **CodeMirror version at 1.7.2.** Which CM version does Obsidian 1.7.2 bundle? No first-party source publishes it for versions before 1.10.0.
- **The community scanner.** Its rule set is still unpublished (#4 research), so it may or may not flag what local lint does. Local lint is the best proxy available.
