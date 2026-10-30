# Research: syntax collisions of the annotation format with plugins and Obsidian features

Ticket: #12. Researched 2026-10-30.

Question: where does `{target}[^rN]` with a `[^rN]: comment` definition clash with popular community plugins or with Obsidian's own features? For each case: does anything break, in which direction (they break us, or we break them), and what is the mitigation?

The format under test is the B+ prototype on `prototype/storage-format`: a Target in `{` `}`, the marker `[^rN]` straight after the `}`, the definition at the end of the heading's section or at the end of the note, and 4-space continuation lines. A Target may span blocks. The parser (`src/parse.ts`) pairs braces with one stack over the whole note, and it ignores frontmatter, fenced and inline code, `%%` comments and HTML comments. It does not ignore math, Templater tags or Dataview fields. New Targets are refused only when an end is inside code or a comment, inside a marker, or crossing a table cell (`checkTarget` in `src/commands.ts`).

## Sources

- **[STATS]** Download counts from [obsidian-releases `community-plugin-stats.json`](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugin-stats.json), fetched 2026-10-30.
- **[LINTER]** [platers/obsidian-linter](https://github.com/platers/obsidian-linter): `src/rules/footnote-after-punctuation.ts`, `src/utils/mdast.ts` (`moveFootnotesToEnd`, `reIndexFootnotes`), `src/lang/locale/en.ts`, `src/rules.ts`, `src/settings-data.ts`.
- **[FNS]** Footnote Shortcut, [michabrugger/obsidian-footnotes](https://github.com/michabrugger/obsidian-footnotes) (now maintained by Comprehensive-Jason): `README.md`, `src/settings.ts`, `src/parsing/landing.ts`, `src/linting/rules/re-index-footnotes.ts`.
- **[DV]** [blacksmithgu/obsidian-dataview](https://github.com/blacksmithgu/obsidian-dataview): `src/data-import/inline-field.ts`.
- **[EXCALI]** [zsviczian/obsidian-excalidraw-plugin](https://github.com/zsviczian/obsidian-excalidraw-plugin): `src/shared/ExcalidrawData.ts`, `src/constants/constants.ts`.
- **[OUTLINER]** [vslinko/obsidian-outliner](https://github.com/vslinko/obsidian-outliner) `README.md`.
- **[VC]** [tadashi-aikawa/obsidian-various-complements-plugin](https://github.com/tadashi-aikawa/obsidian-various-complements-plugin): `src/tokenizer/tokenizers/AbstractTokenizer.ts`, `src/setting/settings.ts`.
- **[PANDOC]** [oliverbalfour/obsidian-pandoc](https://github.com/oliverbalfour/obsidian-pandoc): `global.ts`, `renderer.ts`, `main.ts`. Pandoc 3.9 itself, run on a sample note.
- **[TIDY]** [charliecm/obsidian-tidy-footnotes](https://github.com/charliecm/obsidian-tidy-footnotes) `README.md`. **[BFN]** [alcatrazyu/better-footnote](https://github.com/alcatrazyu/better-footnote) `README.md`. **[SBH]** [trevware/obsidian-sidebar-highlights](https://github.com/trevware/obsidian-sidebar-highlights) `README.md`, `src/managers/inline-footnote-manager.ts`.
- **[COPY]** [mvdkwast/obsidian-copy-as-html](https://github.com/mvdkwast/obsidian-copy-as-html) `main.ts`; [jenningsb2/copy-as-html](https://github.com/jenningsb2/copy-as-html) `main.ts`.
- **[HELP]** Obsidian help, from [obsidianmd/obsidian-help](https://github.com/obsidianmd/obsidian-help): `Obsidian Publish/Publish limitations.md`, `Linking notes and files/PDFs.md`, `Plugins/Footnotes view.md`, `Editing and formatting/Basic formatting syntax.md`, release notes v1.9 and v1.12.
- **[PROTO]** The B+ prototype: `prototypes/storage-format/plugins/review-marks/src/parse.ts`, `commands.ts`, `render-reading.ts`.
- **[TEST]** Tests run for this ticket. (a) The prototype's `parse()` under Node on the snippets quoted below. (b) An isolated Obsidian 1.14.5 (separate user-data dir, temp copy of the prototype vault, driven over CDP), used for editor copy, `MarkdownRenderer.render`, Export to PDF and Canvas. (c) Pandoc 3.9 on a sample note.

A claim marked **Inference** is reasoned from the cited code, not run.

## Summary table

Ranked by downloads [STATS]. "Them → us" means the other tool breaks an Annotation. "Us → them" means our syntax breaks or pollutes their feature.

| # | Plugin or feature | Downloads | Breaks? | Direction | Severity |
| --- | --- | --- | --- | --- | --- |
| 1 | Excalidraw | 8.78M | Yes, in `.excalidraw.md` files | Us → them | High, but easy to avoid |
| 2 | Templater, core Templates | 6.05M | Yes, in edge cases | Both | Medium |
| 3 | Dataview | 5.23M | Yes, when a Target touches an inline field | Us → them | Medium |
| 4 | Outliner (and core Move line) | 1.47M | Yes, for cross-item Targets | Them → us | Medium |
| 5 | Linter | 1.25M | Yes, with 3 opt-in rules | Them → us | High when on |
| 6 | Various Complements | 0.64M | Cosmetic | Us → them | Low |
| 7 | Pandoc plugin, Zotero Integration, Citations, Pandoc Reference List | 0.56M, 0.60M, 0.24M, 0.09M | Comments leak into exports; `[@key]` itself is fine | Us → them | Medium (privacy) |
| 8 | Footnote Shortcut | 0.15M | Yes, its linter and its paste | Them → us | High when used |
| 9 | Copy as HTML, Copy document as HTML | 54k, 43k | Comments and braces leak | Us → them | Low to medium |
| 10 | Sidebar Highlights and Tasks | 44k | No | None | None |
| 11 | Tidy Footnotes | 24k | Moves our definitions | Them → us | Low |
| 12 | Better Footnote | 7.7k | Its delete leaves the braces | Them → us | Low |
| core | LaTeX / MathJax | all users | Only when an end lands inside math | Us → them | Medium |
| core | Export to PDF | all users | Braces and dangling refs printed; author footnote numbers wrong | Us → them | Medium |
| core | Editor copy (HTML clipboard, 1.12+) | all users | `{phrase}r2` pasted | Us → them | Low to medium |
| core | Obsidian Publish | paid add-on | Braces and every Comment published | Us → them | High (privacy) |
| core | Canvas | all users | No | None | None |
| core | Footnotes view, "Delete footnote and reference" | all users | Duplicate listing; delete leaves braces | Them → us | Low |

## Plugins

### 1. Excalidraw (8.78M)

**What happens.** An Excalidraw drawing is a markdown note with `excalidraw-plugin: parsed` in its frontmatter [EXCALI `constants.ts` `FRONTMATTER`]. Under `# Excalidraw Data` / `## Text Elements` each text element is stored as `text ^elementId`. Only `## Drawing` sits inside a `%%` comment by default (`generateMDBase` writes `%%` before the text elements only when the file already had it) [EXCALI `ExcalidrawData.ts` 1631-1660, 1741]. On load, "The Markdown # Text Elements take priority over the JSON text elements": each element's text is whatever sits between the previous `^id` and its own `^id` [EXCALI `ExcalidrawData.ts` 911-1035].

**Us → them.** The prototype acts on every markdown note, so a Reviewer can annotate an Excalidraw file in Markdown view. The braces and marker become part of the element's text in the drawing. A definition placed "end of section" lands between two `^id` lines, so it is glued into the raw text of the next element. Our parser accepts such a Target (`{Hello}[^r1] ^abcdefgh` parses as r1) [TEST a]. **Inference:** the next save from Excalidraw view rewrites the section from its own data.

**Mitigation.** Skip files whose frontmatter has an `excalidraw-plugin` key: no decorations, no commands, no sidebar entries. (Annotating only the "back of the note" above `# Excalidraw Data` is possible, but placement would need special cases. See decisions.)

### 2. Templater and core Templates (6.05M)

**What happens.** Templater runs only `<% … %>` tags, and only when a template is applied. The core Templates plugin replaces `{{date}}`, `{{time}}` and `{{title}}`. Neither reads braces or footnotes otherwise.

**Them → us: unbalanced braces in JavaScript tags.** Templater execution tags hold JavaScript, often with an unbalanced brace per tag (`<%* if (x) { %> … <%* } %>`). Our parser pairs every `{`/`}` outside code on one stack. If such a tag sits inside a Target's span, the pairing goes wrong. `<%* if (x) { %>\n{start of target\n<%* } %>\nend}[^r1]` parses with the Target starting at the `{` inside the first tag [TEST a]. Tags that are only before or after a Target do no harm [TEST a].

**Us → them: an end inside a tag.** A Target that starts or ends inside `<% … %>` or `{{ … }}` inserts a brace into the tag (`<% tp.{file.title %>`), and the template fails or prints garbage. `checkTarget` does not refuse this [PROTO `commands.ts` 46-68].

**Both: duplicate IDs.** Applying a template that contains annotations copies its `[^r1]`… into the destination. If the note already has `r1`, the parser keeps the first `}[^r1]` and the first definition. The second Target shows as plain braces and its Comment disappears: `{one}[^r1] and {two}[^r1]` yields only "one" with "first" [TEST a]. Obsidian also renders one footnote for two definitions with the same label.

**Mitigation.** Mask `<% … %>` like code in `ignoredMask`. Refuse Target ends inside `<% … %>` and `{{ … }}`. Renumber clashing IDs when text is inserted or pasted (or at least flag the duplicate in the sidebar).

### 3. Dataview (5.23M)

**What happens.** Dataview reads inline fields as `[key:: value]`, `(key:: value)` and whole-line `key:: value`. A bracketed field's value runs to the matching `]` or `)`, counting nested brackets [DV `findClosing`, `findSpecificInlineField`]. The key of a whole-line field is cleaned by a parser that drops leading non-word characters, and the value is the rest of the line [DV `extractFullLineField`, `FULL_LINE_KEY_PARSER`]. Queries live in fenced blocks or inline code, which our parser already ignores.

**Us → them.** An Annotation that touches a field changes the field's value:
- `{Rating:: 5}[^r1]` → key `Rating` (the `{` is stripped), value `5}[^r1]`, a string instead of the number 5.
- `[rating:: {5}[^r1]]` → value `{5}[^r1]`, because `[^r1]` is balanced inside the brackets.
- A Target that ends inside a bracketed field moves the field's closing bracket.

Our marker alone does not create a false field. At the `[` of `[^r1]`, the key scan reaches the next `::` and fails because the key would contain `]` or `[` [DV `findSpecificInlineField`]. A Comment that contains `[key:: value]` or `(key:: value)` does become page metadata, because the definition is ordinary note text (**Inference** from the line-based extraction).

**Them → us.** None found. Dataview never rewrites note text through its inline-field parser.

**Mitigation.** Refuse a Target whose ends fall inside a bracketed field or on a whole-line field's line. Reuse Dataview's rules: `[`/`(` + `key::` + matching close. Wrapping a whole bracketed field (`{[rating:: 5]}[^r1]`) is safe.

### 4. Outliner (1.47M), and Obsidian's own Move line up/down

**What happens.** Outliner moves a list item with its children (Ctrl/Cmd+Shift+↑/↓, drag and drop) and indents or outdents it [OUTLINER README]. It knows nothing about footnotes.

**Them → us.** A Target that crosses list items has `{` in one item and `}[^rN]` in another. Moving the second item above the first reverses them. `- b}[^r1]\n- {a` parses as a definition with no Target [TEST a]. The note is not damaged further: the braces become plain text, and the sidebar lists the Comment under "Comments without a target". Core "Move line up/down" does the same. Indenting and outdenting are safe, and so are single-item Targets.

**Mitigation.** No change to Outliner. Optionally detect the case on the next parse (a lone `}[^rN]` before an unmatched `{`) and offer a repair, or accept that the Annotation is lost and the Comment is kept.

### 5. Linter (1.25M)

All Linter rules default to off (`BooleanOption('enabled', …, false, …)` [LINTER `rules.ts` 70]), and lint-on-save defaults to off [LINTER `settings-data.ts` 59]. Three footnote rules break the format when a user turns them on:

- **Footnote after punctuation** rewrites `(\[\^[^\]]+\]) ?([,.;!:?])` as punctuation + reference [LINTER `footnote-after-punctuation.ts` 26]. `{his eyes burning with hatred}[^r6].` (the prototype's own sample) becomes `{…hatred}.[^r6]`, which no longer parses as an Annotation [TEST a]. **Them → us, breaking.** Definition lines are protected (`footnoteAtStartOfLine`).
- **Re-index footnotes** gives every footnote a number in order of first reference, named ones included: the new key is always `` `[^${footnoteIndex++}]` `` [LINTER `mdast.ts` 596-606]. `[^r1]` turns into `[^1]`, which is an author footnote to us, and the braces become literal [TEST a]. **Them → us, breaking.**
- **Move footnotes to the bottom** moves every definition, multi-line ones included, to the end of the note, sorted by reference [LINTER `mdast.ts` 426-543]. Annotations survive, but "end of section" placement is undone. **Them → us, layout only.**

Other Linter rules leave the format alone. "Convert spaces to tabs" turns the 4-space continuation into a tab, which our parser and Obsidian both accept [PROTO `parse.ts` 95-96].

**Mitigation.** Document the three rules. Linter supports per-file and range ignores (`<!-- linter-disable -->`), but asking Reviewers to add those is not realistic. Better to make the format resist the first rule. Accepting `}` + punctuation + `[^rN]` as a marker does not work, because Obsidian would still render it. If the user wants these rules supported, the plugin could recognise the `{…}.[^rN]` shape and repair it.

### 6. Various Complements (0.64M)

**What happens.** The current-file word index splits on whitespace and on ``[ ] / : ? ! = ( ) < > " ' , | ; * ~ ` _`` and a few quotes, but not on `{`, `}` or `^` [VC `AbstractTokenizer.ts` 9-10]. So `{his`, `hatred}` and `^r6` become suggestions, and current-file completion is on by default [VC `settings.ts` 201].

**Us → them, cosmetic.** Accepting `hatred}` inserts a stray `}`, which could pair with an unrelated `{` if a marker followed it. **Inference.**

**Mitigation.** Document the plugin's own setting `excludeCurrentFileWordPatterns` [VC `settings.ts` 76], e.g. `[{}]` and `^\^r\d+$`. Nothing to change on our side.

### 7. Pandoc plugin (0.56M) and citation plugins (Zotero Integration 0.60M, Citations 0.24M, Pandoc Reference List 0.09M)

**Citations.** `[@key]` never collides. Pandoc parses `[@smith2020]` as a citation inside or next to a Target, and our parser ignores square brackets that are not `}[^r…]` [TEST c, PROTO `parse.ts`]. The citation plugins only insert or scan `[@key]` text.

**Pandoc reading our syntax.** Pandoc keeps `{target}` as literal text and turns `[^rN]` into a real footnote that carries the Comment. Multi-line Comments work with the 4-space continuation. A heading Target becomes part of the heading id (`heading-with-a-targetr1`). A Target right after a link, inline code, a `[span]` or a `[[wikilink]]` is not mistaken for an attribute block: `[the site](https://example.com){right after a link}[^r3]` stays literal [TEST c]. **Inference:** a Target whose text is itself valid attribute syntax (`{.class}`, `{#id}`, `{=latex}`) placed directly after a link or code could be swallowed, but that is very unlikely.

**Us → them: Comments leak.** Every export contains the braces and every Comment as a numbered footnote [TEST c]. The plugin exports from HTML by default (`exportFrom: 'html'` [PANDOC `global.ts` 48]). It renders with `MarkdownRenderer.renderMarkdown(markdown, wrapper, path.dirname(inputFile), view)` [PANDOC `renderer.ts` 34]. Its source path is a folder, so our post processor finds no file and exits [PROTO `render-reading.ts` 39-45]. A test render with an empty source path gave the same result: literal braces, plain references, and every Comment in the footnote list [TEST b].

**Mitigation.** Treat exports as a product decision (see decisions). Possible options: a "Copy / export without annotations" command; a documented Pandoc Lua filter that drops `r\d+` footnotes and the matching braces; or a warning in the README.

### 8. Footnote Shortcut (0.15M)

The current version is much more than a hotkey. Its linter, its paste handling and its prefixes all rewrite footnotes [FNS README].

- **Linter: "Fix footnote reference placement"** moves a reference past closing marks and punctuation. `}` is one of the closing marks [FNS `landing.ts` 146], and the rule is on by default (`lintFixPunctuation: true`) [FNS `settings.ts` 103]. `{phrase}[^r1].` → `{phrase}.[^r1]`, which breaks the Annotation, as with Linter. **Them → us.** It runs only through **Lint footnotes**, or on save or on creation if the user enables those (both off by default) [FNS `settings.ts` 108-109].
- **Linter: "Gather definitions"** (`lintMoveToBottom: true`) moves our definitions to the bottom or under a footnote heading. Layout only.
- **Linter: "Reindex"** leaves named labels alone under the default naming style "Keep as written". `r1` counts as named because it is not all digits [FNS `re-index-footnotes.ts` 201, 272]. With style **Numbered** it renames `[^r1]` to a number, which breaks the Annotation. The per-note prefix feature (`lintApplyPrefix`) would rename `[^r1]` to `[^2-r1]`, which breaks it as well.
- **Copy / cut / paste carry definitions** (`carryFootnotesOnCopy: true`). This helps us, because copied annotated text brings its Comment along. But a label that clashes is renamed to `name-2`, and `r1-2` no longer matches `^r\d+$`. A definition with identical text is "reused", so two markers can end up sharing one label [FNS README "Copying, cutting, and pasting"]. Both cases lose an Annotation: `{one}[^r1-2]` parses as nothing [TEST a]. **Them → us.**
- **Hotkey on a marker** opens the definition in a popup. Harmless, and useful.

**Mitigation.** Pick a paste policy (see decisions). Document the lint settings to avoid. Optionally accept `r\d+(-\d+)?` as an ID and renumber on load.

### 9. Copy as HTML (54k) and Copy document as HTML (43k)

- **Copy document as HTML** renders with `MarkdownRenderer.render(this.app, markdown, wrapper, path, this.view)` [COPY mvdkwast `main.ts` 383], using the real path. Our post processor then runs without section info. In the isolated Obsidian, that path hid the reference and dropped the `}`, but left the `{`. It added a badge with the Comment text inline and marked the footnote items with our `rm-hidden` class [TEST b]. In the destination app, which lacks our CSS, the Comment appears twice. **Us → them**, plus a prototype bug: the `{` is left behind.
- **Copy as HTML** (jenningsb2) converts raw markdown with showdown [COPY jenningsb2 `main.ts` 2, 33]. **Inference:** showdown has no footnote support, so `{phrase}[^r1]` and `[^r1]: …` come through as literal text.

**Mitigation.** Fix the no-section-info path so it strips both braces and the badge when it is not inside a live view, or mark the output so these tools can strip it. See the export decision.

### 10. Sidebar Highlights and Tasks (44k)

It treats footnotes as comments on a highlight only when nothing but whitespace or other footnotes sits between `==text==` and the footnote [SBH README "Comments"; `inline-footnote-manager.ts` 155]. Our marker always follows `}`, so it is never adopted as a highlight comment. Our definitions show as ordinary footnotes. **No collision.**

### 11. Tidy Footnotes (24k)

It moves every definition to where the first definition is and renumbers numeric labels only; `[^abc]` is untouched [TIDY README]. Annotations survive and lose "end of section" placement. Better Footnote can run Tidy Footnotes automatically after inserting a footnote [BFN README].

### 12. Better Footnote (7.7k)

Its sidebar lists every footnote, so our definitions appear there too. Editing a card writes the definition, which is safe. Its **Delete this footnote** removes the reference and the definition, but not our braces, so `{target}` is left as literal text [BFN README "Delete"]. **Them → us, low.** "Better Footnote" in the ticket may refer to an older plugin. This is the one in the community store today.

## Obsidian features

### LaTeX / MathJax

Balanced braces in math (`\frac{a}{b}`) and escaped braces (`\{`, `\}`) never confuse the parser. Braces pair up, and `\` skips the next character [PROTO `parse.ts` 113]. A Target that contains math renders fine. A Target that **starts or ends inside** `$…$` or `$$…$$` is allowed today. `Text {and $x^2}[^r1]$` parses as Target `and $x^2` [TEST a], and it puts `}[^r1]` into the TeX, which breaks the formula's rendering (**us → them**). Unbalanced braces in valid TeX are rare, because TeX requires balanced groups, so the reverse direction is not a real risk.

**Mitigation.** Mask `$…$` and `$$…$$` in `ignoredMask` for endpoint checks, and refuse ends inside math, as for code.

### Export to PDF

In the isolated Obsidian 1.14.5, **Export to PDF** of a note with two Annotations and one author footnote printed `{the ratio a/b holds}[1].` and `{reviewed phrase}[2]`. Braces were visible, the references were visible, and nothing was highlighted. The footnote list showed only "1. Author footnote." even though its reference reads [3] [TEST b]. So the prototype's footnote-list hiding runs during export, but its inline decoration does not. The result is braces, dangling references and wrong numbering. **Us → them.**

**Mitigation.** The PDF renderer runs our post processor, so this is fixable on our side. Decide what a PDF should show (see decisions) and make the export path consistent.

### Copy from the editor (HTML clipboard, Obsidian 1.12+)

"Copying text from the editor now includes HTML formatting" [HELP release notes v1.12]. A copy event on a selection with two Annotations produced `text/plain`, `text/markdown` and `text/html`. The HTML was `{the ratio … holds}r1.` and `{reviewed phrase}r2` [TEST b]. The marker label is rendered as bare text, and no post processor runs. Pasting into Google Docs or Word gives braces and stray `r2`. **Us → them.** The plain-text and markdown flavours are raw source, which is expected.

**Mitigation.** Optional: a CodeMirror copy handler that rewrites the `text/html` flavour, or a "Copy without annotations" command.

### Obsidian Publish

"Obsidian Publish has minimal support for Community plugins". Only plugins that output raw markdown work there [HELP Publish limitations]. Publish renders the raw note, so readers see `{target}` with a footnote reference, and every Comment sits in the footnote list. **Inference** from the help text (Publish was not tested). **Us → them, a privacy risk:** review Comments go public.

**Mitigation.** Warn in the README. Optionally ship a `publish.css` snippet that hides `[^r…]` footnotes. Publish CSS cannot strip the braces, and it cannot reliably select footnotes by label. Resolving Annotations before publishing is the only clean answer.

### Canvas

In the isolated Obsidian, a Canvas text card holding `{a reviewed phrase}[^r1]` plus its definition was decorated correctly when rendered: highlight, badge, hidden marker and hidden footnote list. It was also decorated in the card's Live Preview editor, where the syntax reappears with the cursor on the definition line [TEST b]. A file card embedding an annotated note renders through the normal embed path. In a card, `app.workspace.activeEditor.file` is undefined, so file-based actions (sidebar, `Vault.process` fallback) do not target the `.canvas` file. **No collision.**

### Footnotes view (core, 1.9+) and "Delete footnote and reference"

The **Footnotes view** core plugin "lists all footnotes in the active note" [HELP `Footnotes view.md`; release notes v1.9]. Our Comments appear there next to author footnotes. Editing them there is safe. Obsidian's editor context menu has **Delete footnote and reference**, which removes one reference and the definition [FNS README, "Deleting a footnote"]. On an Annotation it leaves `{target}` as literal braces. **Them → us, low.**

## Mitigations to carry into the design

1. Widen the ignored-or-refused set beyond code and comments: inline and block math, `<% … %>`, `{{ … }}`, Dataview bracketed fields and whole-line fields, link and wikilink internals, and HTML tags. Mask `<% … %>` for pairing too.
2. Skip Excalidraw files (`excalidraw-plugin` frontmatter key).
3. Handle duplicate and renamed IDs: renumber on paste or template insert, or flag duplicates in the sidebar.
4. Make every render path consistent (PDF, `MarkdownRenderer` without section info, editor HTML copy). Today the export path leaves a `{`, keeps references and renumbers author footnotes wrongly.
5. README "Known conflicts" section: the Linter rules *Footnote after punctuation* and *Re-index footnotes*; Footnote Shortcut lint (*Fix footnote reference placement*, *Numbered* naming, prefixes) and paste renaming; Outliner and Move line with cross-item Targets; Publish and Pandoc exports leaking Comments; Various Complements' exclude pattern.
