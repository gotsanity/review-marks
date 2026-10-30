# Annotations are stored as `{target}[^rN]` with footnote definitions

An Annotation is written into the note as `{target}[^rN]`, and its Comment as an ordinary footnote definition `[^rN]: comment`. Depending on a setting, the definition goes at the end of the heading's section or at the end of the note. We chose this because the raw file stays readable and portable without the plugin: footnotes render natively in Obsidian and in most Markdown tools. The body text stays clean in long, heavily formatted notes, and the plugin can still bring each Comment back beside its Target through the badge, the popover and the sidebar. Changing format later would mean migrating every annotated note, so this is hard to reverse.

## Considered options

Four formats were prototyped on a real 400-line note, with the same 12 edge cases ([Prototype: Plain-text storage format for annotations](https://github.com/gotsanity/review-marks/issues/6)).

- **Inline `{target}(comment)`:** the Comment sits inside the prose and bloats paragraphs, table rows and headings. It also needed invented escape rules for `)`, `[`, `]` and `|`.
- **Native `==target==%%comment%%`:** degrades gracefully without the plugin, but a Target can't cross blocks, and multi-line Comments leak into Reading view.
- **Callout after block, `{target}(r1)` + `> [!review]`:** readable raw, but callouts have to sit after the whole list or table, and the `[r1]` marker clashes with reference links.
- **CriticMarkup `{==target==}{>>comment<<}`:** the de facto standard, rejected on purpose. The plugin is its own project, and every existing CriticMarkup plugin extends the spec incompatibly ([Grilling: Build a new plugin or adopt an existing one](https://github.com/gotsanity/review-marks/issues/10)).

## Consequences

- A Target may cross blocks as one span, and headings can be annotated. Both change heading anchors and the outline while an Annotation exists, which the user accepted.
- Review footnotes share Obsidian's footnote numbering in Reading view. Tools that rewrite footnotes, such as Linter and Footnote Shortcut, can break Annotations and are documented as conflicts.
