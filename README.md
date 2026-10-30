# Review Marks

Highlight passages in a note and attach comments that can be read inline, on hover, or in a sidebar.

## Known conflicts

An annotation is stored as `{target}[^rN]` with a `[^rN]: comment` footnote definition. Tools that rewrite footnotes can break this.

### Linter

Turn these rules off, or leave lint on save off:

- **Footnote after punctuation** moves `[^rN]` after the punctuation that follows `}`. The annotation then no longer parses.
- **Re-index footnotes** renames `[^r1]` to `[^1]`. The annotation becomes an ordinary footnote and its braces show as text.
- **Move footnotes to the bottom** moves every comment to the end of the note. Annotations survive, but "end of section" placement is lost.

### Footnote Shortcut

- Turn off **Fix footnote reference placement**, which moves `[^rN]` past the `}`.
- Keep the naming style on **Keep as written**. **Numbered** renames `[^rN]` labels.
- Don't apply per-note prefixes. They rename `[^r1]` to something like `[^2-r1]`.
- When you paste annotated text, Footnote Shortcut renames a clashing label to `rN-2`, and that annotation is lost. Annotated text pasted or added from a template can also bring an `rN` that the note already uses. The annotations sidebar flags duplicate IDs, and **Fix IDs** renumbers them as one undo step.

### Exports and Publish

Obsidian Publish, the Pandoc plugin and Pandoc itself read the raw note. They show every target with its braces and every comment as a numbered footnote. Resolve or remove annotations before you publish or export a note you share.

### Other plugins' syntax

A target can't start or end inside math, a Templater `<% %>` or Templates `{{ }}` tag, a Dataview inline field, a link or an HTML tag. Review Marks refuses such a selection with a notice and changes nothing. Excalidraw drawings are left alone: no highlighting, commands or drag.
