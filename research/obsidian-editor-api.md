# Research: Obsidian editor API for decorating custom inline syntax

Ticket: #2. Researched 2026-10-28.

Question: how can a plugin render custom inline markup (an Annotation: a highlighted Target plus an Instruction, stored as plain text in the note) in Live Preview and Reading view, show Instructions on hover or tap, list Annotations in a sidebar, edit the note text without breaking undo, and stay mobile-safe?

## Sources

- **[API]** `obsidian.d.ts` from [obsidianmd/obsidian-api](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts), package version 1.14.4. It pins `@codemirror/state` 6.7.6 and `@codemirror/view` 6.43.13.
- **[DOCS]** Obsidian developer docs, read from the source repo [obsidianmd/obsidian-developer-docs](https://github.com/obsidianmd/obsidian-developer-docs) (published at docs.obsidian.md). Pages: Editor/Decorations, Editor/View plugins, Editor/State fields, Editor/Editor, Editor/Communicating with editor extensions, Editor/Markdown post processing, User interface/Views, Getting started/Mobile development, Releasing/Plugin guidelines.
- **[CM6]** [CodeMirror reference manual](https://codemirror.net/docs/ref/): `EditorView.decorations`, `EditorView.atomicRanges`, `WidgetType`, `hoverTooltip`, `Transaction.addToHistory`.
- **[COMMENTATOR]** [Fevol/obsidian-criticmarkup](https://github.com/Fevol/obsidian-criticmarkup) ("Commentator", v0.2.7, `isDesktopOnly: false`). It does nearly what we want: CriticMarkup highlights and comments (`{==target==}{>>comment<<}`) stored inline, with Live Preview, Reading view, comment tooltips, and an annotations sidebar.
- **[DATAVIEW]** [blacksmithgu/obsidian-dataview](https://github.com/blacksmithgu/obsidian-dataview), `src/ui/views/inline-field-live-preview.ts`. Inline `[key:: value]` fields rendered in Live Preview. `isDesktopOnly: false`.

Unless a claim is marked **Inference**, it comes from the source cited next to it.

## 1. Live Preview: CodeMirror 6 extensions

**Registration.** `Plugin.registerEditorExtension(extension: Extension)` registers any CM6 extension: a `ViewPlugin`, a `StateField`, or an array of them. If you pass an array and later change its contents, `Workspace.updateOptions()` reapplies it, which lets a plugin reconfigure its extensions at runtime. [API]

**Decoration kinds.** CM6 has four [DOCS Decorations, CM6]:

- `Decoration.mark` styles a range in place. Use it for the Target highlight.
- `Decoration.widget` inserts a DOM element at a position.
- `Decoration.replace` hides a range or swaps it for a widget. Use it to hide the delimiters and the Instruction text.
- `Decoration.line` styles whole lines.

Custom DOM comes from a subclass of `WidgetType` with `toDOM(view)`. Also implement `eq()` so CM6 can reuse the widget's DOM instead of rebuilding it. `ignoreEvent(event)` decides which events inside the widget the editor ignores. The default is to ignore all of them. [CM6]

**ViewPlugin or StateField.** A ViewPlugin can only decorate what is in the viewport (`view.visibleRanges`), and it usually performs better. Use a StateField when you need decorations outside the viewport, or when a decoration can change layout. [DOCS Decorations] The hard rule in CM6 is that decorations provided through a function, which is how ViewPlugins provide them, "must not introduce block widgets or replacing decorations that cover line breaks". [CM6 `EditorView.decorations`] So if a Target or Instruction can span lines, the replace decorations that hide its syntax must come from a StateField.

**Atomic ranges.** To make the cursor skip a hidden span in one step instead of entering it, also supply the decoration set to `EditorView.atomicRanges`. This applies to cursor motion only and does not stop programmatic selection. [CM6]

**Show the syntax when the cursor is on it.** Obsidian has no API for this. Every plugin builds it the same way:

1. Read `state.selection` while building decorations.
2. Skip the `replace` decorations (show the raw syntax) for any range the selection overlaps.
3. Rebuild on `update.selectionSet` (ViewPlugin) or when `tr.newSelection !== tr.startState.selection` (StateField).

Dataview checks `selectionAndRangeOverlap(selection, start, end)` and rebuilds on `selectionSet || viewportChanged`. [DATAVIEW] Commentator uses a StateField, keeps the hide-bracket and replace decorations off ranges the selection touches, and redraws only the ranges in the old and new selection. Its comment notes a cost of "2-6ms for every selectionchange" on a stress test. [COMMENTATOR `markup-renderer.ts`]

**Live Preview or Source mode.** The CM6 editor is shared by both modes. Read `state.field(editorLivePreviewField)` (a `StateField<boolean>`) and return `Decoration.none` in Source mode. Both established plugins do this. [API, DATAVIEW, COMMENTATOR] Two other Obsidian state fields are useful here: `editorInfoField`, which gives a `MarkdownFileInfo` with the file and `Editor`, and `editorEditorField`, which gives the `EditorView`. `livePreviewState.mousedown` reports a drag-select in progress, which helps avoid flicker while the user selects text. [API]

**Parsing the syntax.** Obsidian's docs walk the Markdown parse tree with `syntaxTree(state)` from `@codemirror/language`. [DOCS Decorations] Obsidian's Markdown grammar does not know about custom syntax, so Commentator and Dataview parse their own syntax out of the document text. Dataview keeps the parsed ranges in its own `StateField<RangeSet<...>>`. [COMMENTATOR, DATAVIEW]

**Reaching CM6 from outside the editor.** `Editor` does not expose the `EditorView` in its type. The docs say to use `(view.editor as any).cm as EditorView`, marked `@ts-expect-error`. You can then call `editorView.plugin(myPlugin)`, or `editorView.dispatch({effects})` to drive a StateField. [DOCS Communicating with editor extensions] Commentator calls `view.editor.cm.dispatch(...)` throughout. [COMMENTATOR]

## 2. Reading view: Markdown post processors

**API.** `Plugin.registerMarkdownPostProcessor((el, ctx) => ..., sortOrder?)` runs after Markdown has been rendered to HTML. It can add, remove, or replace elements. [DOCS Markdown post processing, API] `ctx` (a `MarkdownPostProcessorContext`) has:

- `docId`
- `sourcePath`
- `frontmatter`
- `addChild(MarkdownRenderChild)`, which ties a component's lifecycle to the element
- `getSectionInfo(el)`, which returns `{ text, lineStart, lineEnd }` or `null`

The docs say to call `getSectionInfo(el)` just before you need it and to expect `null` "in many circumstances". [API]

**Limits.** These all affect our syntax.

- The processor works on HTML that Obsidian has already rendered, not on the source. Obsidian may already have parsed parts of the custom syntax as other Markdown. Commentator has to undo `<del>` and `<mark>` that Obsidian produced inside its `{~~ ~~}` and `{== ==}` brackets, and has to decode HTML entities. [COMMENTATOR `post-process/renderer.ts`]
- The processor is called once per rendered section (block), not once per document. A span that crosses blocks arrives in pieces, with the opening delimiter in one call and the closing one in another. Commentator maps each element back to source lines with `getSectionInfo`, re-parses the full note text, and works out whether the element is wholly inside a range, opens one, or closes one. That logic covers about 150 lines plus FIXMEs. [COMMENTATOR]
- When `getSectionInfo` returns `null`, as it can for embeds, exports, or hover previews, the processor has no source positions. It can only fall back to parsing the element's own text. [API, COMMENTATOR]
- **Inference:** spans that cross blocks are the main cost driver. If our syntax forbids an Annotation from crossing a block boundary (a blank line, list item, or heading), the Reading view renderer becomes a simple text-node walk within each block.

**Reading view lifecycle.** Use `MarkdownRenderChild` with `ctx.addChild()` for anything that needs cleanup when Obsidian re-renders the section. [API]

## 3. Hover popovers and mobile/tap equivalents

Several options are available:

- **CM6 `hoverTooltip(source, options)`** shows a tooltip when the pointer hovers over text, using a callback that maps position to tooltip. All hover tooltips share one container. [CM6] It is pointer-hover only.
- **Obsidian `HoverPopover`** (`new HoverPopover(parent: HoverParent, targetEl, waitTime?, staticPos?)`) has `hoverEl` and `state`. Together with `registerHoverLinkSource(id, info)`, it is the system behind the Page preview core plugin's link previews. [API] It is built for previews of linked notes, not for arbitrary content.
- **Hand-rolled tooltip.** This is what Commentator does. Its `CommentIconWidget` (a `WidgetType` placed with `Decoration.replace` over the comment) shows a `<div class="popover hover-popover">` on `mouseenter`. It renders the comment with `MarkdownRenderer.render(...)`, places it with `getBoundingClientRect`, and hides it on `mouseleave`. The same widget opens the tooltip and focuses it on `click`, and offers a `Menu` on `contextmenu` (`menu.showAtMouseEvent(e)`). [COMMENTATOR `comment-widget.ts`]
- **Mobile.** Touch devices have no hover. **Inference:** the tap path must not depend on hover. Wire `click` or `pointerup` on the Target or icon to open the same popover or a `Modal`. Commentator's click handler covers this. Branch the UI with `Platform.isMobile` or `Platform.isPhone` if needed. [API `Platform`] Long-press does not fire `contextmenu` reliably everywhere (**unverified**), so actions should also be reachable from a command or the popover itself. The `editor-menu` workspace event (`(menu, editor, info)`) adds items to the editor's own context menu, and that menu exists on mobile. [API]

## 4. Sidebar view listing Annotations

**Registration.** Extend `ItemView` and implement `getViewType`, `getDisplayText`, `onOpen`, and `onClose`. Register it with `registerView(type, leaf => new MyView(leaf))`. [DOCS Views] To open it, either:

- call `workspace.getLeavesOfType(type)`, then `workspace.getRightLeaf(false).setViewState({type, active: true})` and `workspace.revealLeaf(leaf)` [DOCS Views], or
- call `workspace.ensureSideLeaf(type, 'right', {active, reveal})` (since 1.7.2). [API]

`ItemView.addAction(icon, title, cb)` adds header buttons. [API]

**Rules.**

- Never hold references to view instances; use `getLeavesOfType()`. [DOCS Views]
- Don't detach leaves in `onunload`. [DOCS Plugin guidelines]
- Avoid `workspace.activeLeaf`; use `getActiveViewOfType(MarkdownView)`. [DOCS Plugin guidelines, API]

**Staying in sync.** Listen to the workspace events `active-leaf-change` and `editor-change` (`(editor, info)`) and re-parse the active note. [API] Commentator keeps a vault-wide index (its own worker-backed `Database`) and the Svelte view subscribes to `database-update`. [COMMENTATOR] For a single-note sidebar, re-parsing the note on `editor-change` should be enough (**Inference**).

**Jumping to an Annotation.** Use `Editor.offsetToPos(offset)` and `posToOffset`, then `editor.setSelection(from, to)` and `editor.scrollIntoView({from, to}, true)`. [API] Alternatively, dispatch CM6 `{selection, scrollIntoView: true}` on `editor.cm`, which is what Commentator does. [COMMENTATOR] In Reading view there is no cursor, so jumping means scrolling the preview. `MarkdownView.getMode()` returns `'source' | 'preview'` [API]. **Unverified:** the exact public way to scroll the preview to a line. `setEphemeralState({line})` is the conventional route but is typed `unknown`/`any`.

## 5. Editing text programmatically without breaking undo

- Use the `Editor` interface: `replaceRange(text, from, to?, origin?)`, `replaceSelection`, and `transaction({changes, selection}, origin?)` for several changes as one atomic step. [API] Edits go through CM6, so they land in the editor's undo history. The plugin guidelines say: "Prefer the Editor API instead of `Vault.modify` to the active file". `Vault.modify` throws away cursor, selection, and fold state. [DOCS Plugin guidelines]
- Raw CM6 `view.dispatch({changes})` also goes through history. Do not set `Transaction.addToHistory.of(false)` on user-meaningful edits. [CM6] **Inference:** one `transaction()` or `dispatch` per user action makes the action a single undo step. Creating an Annotation (wrap the Target and insert the Instruction) should be one transaction, not two `replaceRange` calls.
- For a note that is not open in an editor, for example when editing from the sidebar for a closed file or from Reading view with no live editor, use `Vault.process(file, data => newData)`. It is atomic and does not conflict with other plugins. [DOCS Plugin guidelines, API] It does not add to any editor undo stack (**Inference**).
- `Editor` abstracts over CM5 and CM6. Using it rather than `cm` directly is what the docs recommend for portability. [DOCS Editor]

## 6. Desktop-only vs mobile-safe

- Everything above (`registerEditorExtension`, CM6, post processors, `ItemView`, `Menu`, `Modal`, `Editor`, `Vault.process`, `Platform`) is part of the shared API. Both reference plugins ship with `isDesktopOnly: false`. [API, COMMENTATOR, DATAVIEW manifests]
- Node.js and Electron APIs are not available on mobile, and calling them crashes the plugin. Setting `isDesktopOnly: true` in the manifest is the only way to block installation on mobile. [DOCS Mobile development]
- Regex lookbehind only works on iOS 16.4 and later. Avoid it in the syntax parser or provide a fallback. [DOCS Mobile development]
- `Platform` has `isDesktop`, `isMobile`, `isDesktopApp`, `isMobileApp`, `isIosApp`, `isAndroidApp`, `isPhone`, and `isTablet`. Mobile behaviour can be emulated on desktop with `app.emulateMobile(true)`. [API, DOCS Mobile development]
- Hover is not available on touch devices (see section 3).

## Implications for the plan

1. **Two renderers.** Live Preview needs a CM6 StateField or ViewPlugin with `mark` + `replace` decorations. Reading view needs a post processor. They cannot share DOM code, but they can share one parser that turns text into Annotation ranges.
2. **Syntax choice drives cost.** Inline, single-block syntax that Obsidian's Markdown leaves alone keeps both renderers simple, and lets the Live Preview decorations come from a ViewPlugin. Spans that cross blocks or lines force a StateField and Commentator-level stitching in Reading view.
3. **Instruction UI.** Use a widget or Target with click and hover handlers that opens a hand-rolled popover. Tap is the primary trigger; hover is extra on desktop.
4. **Writes.** Use `Editor.transaction` when a live editor exists and `Vault.process` otherwise.
5. **Prior art.** Commentator covers our scope closely and is the reference implementation to study before building. **Open question for the map:** does it already meet the need?
