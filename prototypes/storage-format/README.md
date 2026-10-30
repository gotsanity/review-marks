# Prototype: plain-text storage format for annotations (B+)

> **Throwaway prototype code.** No tests, minimal error handling, not production code. Delete it once the decision is made.

## The question

Issue #6 asks which plain-text syntax should store an Annotation (Target + Comment) inside a note. The first round built four variants (A to D) side by side. The user picked B, footnote at end, and asked for changes. This folder now holds B+, the re-prototype with those changes. The A to D plugins stay in `plugins/` for history. They are no longer built or loaded.

## The format

```markdown
Kell fails the save and seizes in place, {his eyes burning with hatred}[^r6].

[^r6]: Check the recording (~00:04): was it "hatred" or "contempt"?
    A second line is indented 4 spaces.
```

- The Target is wrapped in `{` and `}`, and the `[^rN]` marker follows the `}`. IDs go `r1`, `r2`, and so on. A new one takes the highest id plus one.
- A Target may cross blocks: `{` goes where it starts and `}[^rN]` goes where it ends, even across paragraphs, list items and blank lines.
- Braces inside code (fenced or inline) are ignored, and a Target can't start or end inside code. Braces without a marker are plain text.
- Headings can be annotated. The heading's anchor and its outline entry then include the braces and the marker.
- Links in a Comment stay real links.
- The plugin acts on every markdown note. There is no frontmatter switch any more.

## Where a new Comment goes

The **Comment placement** setting decides this for new annotations only. It never moves existing ones.

- **End of section** (default). The definition goes at the end of the section of the heading the Target ends in, just before the next heading of any level. It goes after any `[^r…]` definitions already there, with blank lines around it. Text before the first heading counts as its own section.
- **End of note.** The definition goes after the last existing `[^r…]` definition, or at the end of the file.

Reading view keeps Obsidian's default and shows every footnote at the end of the note.

## Converting a note

Changing the setting never rewrites a note. To convert one, run either command (no default hotkeys):

- **Move comments to end of note.** Every `[^rN]` definition goes to the end of the file, in the reading order of the markers.
- **Move comments to end of sections.** Each definition goes to the end of the section its Target ends in, using the same rule as new annotations. Within a section, the definitions follow the reading order of their markers.

Both are one undo step and keep the cursor and scroll position. Running one twice changes nothing. Definitions move as whole lines, byte for byte. Author footnotes never move. A definition with no marker and a marker with no definition stay where they are, and a Notice gives the count. The code is in `src/convert.ts`.

## Run it

1. From the repo root, run `npm run prototype:storage-format`. This installs and builds `plugins/review-marks` into `vault/.obsidian/plugins/proto-review-marks/`. The built output is committed, so you only need this after changing plugin code.
2. In Obsidian, use **Open folder as vault** and pick `prototypes/storage-format/vault`.
3. When Obsidian asks whether you trust the vault's author, choose **Trust author and enable plugins**. If you missed the prompt, go to Settings > Community plugins, click **Turn on community plugins**, and check that **Review Marks (prototype)** is on. Obsidian stores restricted mode outside the vault, so a config file can't skip this step.

## The test notes

Both notes are `sample-document.md` with the same 12 annotations the earlier variants used. `plugins/review-marks/make-notes.mjs` generates them.

- `Review sample - end of note.md` has every definition at the end of the note.
- `Review sample - end of section.md` has each definition at the end of its Target's section.

The 12 cases:

1. Plain span in a long paragraph
2. Target containing parentheses
3. Target crossing bold formatting
4. Two annotations in one paragraph, part 1
5. Two annotations in one paragraph, part 2
6. Comment containing ( ) { } [[ ]]
7. Multi-line Comment (two lines)
8. Table cell with a wikilink that uses an escaped pipe (the "r8 bug" from round 1, now fixed)
9. Plain table cell
10. Whole list item
11. One Target across two list items
12. Target inside a heading, with a long Comment

## What to try

- **Live Preview.** The Target is highlighted and the syntax is hidden. Click into a Target and the braces and marker come back. They hide again when the cursor leaves or the editor loses focus. Table cells (cases 8 and 9) work too.
- **Reading view.** Same highlight and badge. The footnote list at the end leaves out the `[^r…]` entries but keeps your own footnotes.
- **Badge.** A pill after each Target shows the start of the Comment. Click it to pin the full Comment.
- **Hover.** Hover a Target or badge to see the full Comment. On mobile, tap instead.
- **Commands** (no default hotkeys):
  - **Annotate selection.** Select text, run it, type the Comment. One Ctrl/Cmd+Z undoes the whole change.
  - **Edit comment at cursor.** Works with the cursor on the Target, the marker or the definition.
- **Settings** (Settings > Review Marks (prototype)): comment placement, show comment badge, badge excerpt length (32), show comment on hover, and hide review footnotes in the footnote list.

The test note keeps one `<!-- PROTOTYPE NOTE -->` comment at the end. It says that r9 targets the first of two identical `17 (fail)` cells.

## Code layout

`plugins/review-marks/src/`:

| File | What it holds |
| --- | --- |
| `parse.ts` | Parser, code masking, headings and sections, definition placement. No Obsidian imports. |
| `settings.ts` | Settings interface, defaults, the live `settings` object, the settings tab. |
| `ui.ts` | Popover, badge, comment modal. |
| `render-dom.ts` | Decorates rendered HTML for a known source range. Reading view sections and Live Preview table cells both use it. |
| `render-live.ts` | Live Preview: a StateField of decorations plus a scan of Obsidian's table widget. |
| `render-reading.ts` | Reading view post processor and the footnote list. |
| `commands.ts` | The two commands, `createAnnotation(editor, from, to, comment)` and `writeComment(editor \| file, id, comment)`. |
| `convert.ts` | The two "Move comments to …" commands. |
| `main.ts` | Wiring only. |

`createAnnotation` and `writeComment` are also on the plugin instance as `app.plugins.plugins['proto-review-marks'].api`.
