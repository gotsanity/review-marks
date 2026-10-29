# Prototype: plain-text storage format for annotations

> **Throwaway prototype code.** No tests, minimal error handling, not production code. Delete it once the decision is made.

## The question

Issue #6: which plain-text syntax should store an Annotation (Target + Instruction) inside a note? The test document is `sample-document.md`, which is long and heavily formatted. The same 12 Annotations are applied in four syntaxes so they can be compared side by side.

## The four variants

| Key | Note | Syntax |
| --- | --- | --- |
| A | `A-inline.md` | Inline `{target}(instruction)` |
| B | `B-footnote-end.md` | Footnote at end |
| C | `C-highlight-comment.md` | Native highlight + comment |
| D | `D-callout-after-block.md` | Callout after block |

Each variant plugin (`proto-format-a` to `-d`) only acts on notes whose frontmatter has a matching `review-format`, so all five plugins run in one vault without interfering.

## Run it

1. From the repo root: `npm run prototype:storage-format`. This installs and builds every plugin into `vault/.obsidian/plugins/`. The built output is also committed, so this step is only needed after changing plugin code.
2. In Obsidian: **Open folder as vault** and pick `prototypes/storage-format/vault`.
3. When Obsidian asks whether you trust the vault's author, choose **Trust author and enable plugins**. If you missed that prompt, go to Settings > Community plugins, click **Turn on community plugins**, and check that all five `PROTOTYPE` plugins are enabled. Obsidian keeps restricted mode outside the vault files, so a config file can't skip this step.

## Switching

A yellow-on-black pill at the bottom centre of the window shows the current variant, for example `B (Footnote at end)`. The arrows cycle A, B, C, D and wrap around. The next note opens in the same pane, in the same view mode and at the same scroll position (as a fraction of the note), so you stay on roughly the same passage. The pill is a test tool and is not part of the design under review.

The command palette also has **Prototype: next variant** and **Prototype: previous variant**. They have no default hotkeys; assign your own if you like.

## What to compare in each variant

- **Raw file in Source mode.** Is it still readable to someone without the plugin?
- **Live Preview.** Is the Target highlighted, is the syntax hidden until the cursor enters it, and does the indicator stay out of the way?
- **Reading view.** Same highlight and indicator?
- **Popover.** Hover over or tap an Annotation to see its Instruction.
- **"Prototype: annotate selection" command.** Select some text, run the command and watch what it does to the file. Also try "Prototype: edit instruction at cursor".
- **The 12 test Annotations:**
  1. Plain span in a long paragraph
  2. Target containing parentheses
  3. Target crossing bold formatting
  4. Two annotations in one paragraph, part 1
  5. Two annotations in one paragraph, part 2
  6. Instruction containing ( ) { } [[ ]]
  7. Multi-line Instruction (two lines)
  8. Table cell with a wikilink that uses an escaped pipe
  9. Plain table cell
  10. Whole list item
  11. Target spanning two list items (crosses blocks)
  12. Target inside a heading, with a long Instruction

Where a format can't represent a case cleanly, the note has a visible `<!-- PROTOTYPE NOTE: ... -->` next to it. Those failures matter most.
