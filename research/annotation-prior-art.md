# Prior art: Obsidian annotation and comment plugins

Research for [issue #3](https://github.com/gotsanity/Obsidian-Annotations/issues/3). Gathered 2026-10-28 from primary sources: the community plugin registry ([`community-plugins.json`](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json), 9,617 entries on that date), each plugin's GitHub repo (README, `manifest.json`, issue tracker, repo metadata via the GitHub API), the [CriticMarkup spec](https://github.com/CriticMarkup/CriticMarkup-toolkit/blob/master/README.md), and the [Obsidian help vault](https://github.com/obsidianmd/obsidian-help/blob/master/en/Editing%20and%20formatting/Basic%20formatting%20syntax.md).

Vocabulary follows [GLOSSARY.md](../GLOSSARY.md): Annotation, Target, Instruction, Reviewer, Resolution.

**Caveats on method.** Rendering, view, and mobile claims come from READMEs and issue trackers. I did not install and test the plugins. "Mobile" means `isDesktopOnly: false` in `manifest.json` unless the README or an issue says more. A `false` flag means the plugin loads on mobile, not that anyone has tested it there. Star counts and dates are from the GitHub API on the research date.

## Summary

- Obsidian has no built-in way to attach a note to a span of text. The two native syntaxes are `%%comment%%`, which is hidden in Reading view, and footnotes `[^1]`. Neither stores a Target: a comment or footnote reference sits at a single point.
- **CriticMarkup's highlight-plus-comment form, `{==Target==}{>>Instruction<<}`, is the de facto plain-text standard.** At least eight plugins use it. Its spec says outright to avoid newlines inside marks and to wrap Markdown tokens completely, which is the root of the breakage reported in tables and across formatting.
- The best-known CriticMarkup plugin, **Commentator** (Fevol, 262 stars), is not in the community registry. It is BRAT-only, labelled beta with a "non-zero risk of text being removed", and its comment editing is reported broken (issue #35). It is built for track changes (suggestion mode), and comments are secondary.
- Since mid-2026 there has been a wave of small CriticMarkup review plugins aimed at AI agents: Track Changes, Review Comments, Review Comments AI, Agent Comments, Inline Notes, Inkling, Relay Comments, Review Critic. They are all under 6 months old with 0–15 stars, so they are active but unproven.
- About half the comment plugins store comments **outside the note**, in `data.json`, a dot-folder, or sidecar files. That fails our "raw file stays readable without the plugin" requirement.
- **Tables are the recurring failure point** for in-note syntaxes: Commentator #48, Track Changes #17 (open), Document Comments #79 and #28, SideNote #35. Formatting that crosses the Target is the next most common (Document Comments #110, Inline Notes README).
- **The gap:** no plugin in the registry is a mature, Reviewer-focused tool that stores a Target-plus-Instruction pair in the note in a readable format, and also gives inline, hover/tap, and sidebar editing, in Live Preview and Reading view, on desktop and mobile. The candidates each miss at least one of these (see the end of this document).

## 1. Native Obsidian syntax

Source: [Basic formatting syntax](https://github.com/obsidianmd/obsidian-help/blob/master/en/Editing%20and%20formatting/Basic%20formatting%20syntax.md), Obsidian help vault.

| | `%%comment%%` | Footnote `[^id]` / `^[inline]` |
|---|---|---|
| Storage | `This is an %%inline%% comment.` or a `%%` block | `text[^1]` + `[^1]: note` at the bottom; inline `^[note]` |
| Target span | None, it is a point | None, it is a point |
| Live Preview | Shown (comments "are only visible in Editing view") | Reference footnotes render; **inline footnotes "only work in reading view, not in Live Preview"** |
| Reading view | Hidden | Rendered as numbered notes at the end |
| Views | Inline only | Inline plus the core **Footnotes view** sidebar |
| Portability | Obsidian-only; the help says to use `<!-- -->` in other apps | Standard in most Markdown dialects (GFM, Pandoc, MultiMarkdown) |

Plugins that build on these:

- **Cornell Marginalia** (`cornell-marginalia`, [latazadehomero/cornell-marginalia](https://github.com/latazadehomero/cornell-marginalia)). Storage is `%%> note %%`, with type prefixes such as `%%> X- Wrong definition %%`. It renders the note in the margin. It is aimed at study and active recall, not review. The note marks a point, not a Target. Breakage: block layout splits paragraphs from following lists ("Obsidian might push the list…", README), and #21 (open) reports "Multi-line marginal notes disappear in Reading View". Mobile flag false. 120 stars, last push 2026-05.
- **Enhanced Annotations** (`enhanced-annotations`, [ycnmhd/obsidian-enhanced-annotations](https://github.com/ycnmhd/obsidian-enhanced-annotations)). Collects `==highlights==` and labelled HTML comments `<!--todo: ...-->` into a sidebar. **`isDesktopOnly: true`**, and #22 (mobile support) is open. 30 open issues, including #40 "highlights not rendered in Live Preview" and #25 "wrong highlight recognition in code block". Last push 2025-02, so effectively unmaintained.
- **Sidebar Highlights and Tasks** (`sidebar-highlights`, [trevware/obsidian-sidebar-highlights](https://github.com/trevware/obsidian-sidebar-highlights)). Storage is `==Target==[^1]` with `[^1]: Instruction`, inline `^[...]`, and `%%...%%`. "Highlights are `==text==`, comments are footnotes." It is a vault-wide sidebar browser, not an inline editor. Mobile is supported (README: "on a phone, press and hold"). 164 stars, active (pushed 2026-10). **This is the closest native-syntax match to a Target-plus-Instruction pair**, but the Instruction lives at the bottom of the note, far from the Target.
- **Marginalia MD** (`marginalia-md`, [lucapericlp/marginalia-md](https://github.com/lucapericlp/marginalia-md)). Storage is `==passage==[^mn-s-id]` + `[^mn-s-id]: note`. It renders notes in the margin in Live Preview, Source, and Reading. README: "Desktop interactions have been tested; mobile has not yet been verified", and overlapping passage notes are rejected. Created 2026-10-20, 2 stars.
- **Sidenotes** (`side-notes`, [cparsell/sidenotes](https://github.com/cparsell/sidenotes)), **Better Footnote** (`better-footnote`, [alcatrazyu/better-footnote](https://github.com/alcatrazyu/better-footnote)), and **Annotations Everywhere** (`annotations-everywhere`, [heptazero/annotations-everywhere](https://github.com/heptazero/annotations-everywhere)) all display footnotes as Tufte-style margin notes or a sidebar. These are for authors writing asides, not for review. Sidenotes notes that footnote definitions are single-line, so `SHIFT+ENTER` does not add a line break.
- **Comments** (`comments`, [jaspersurmont/obsidian-comments](https://github.com/jaspersurmont/obsidian-comments)). Storage is a `> [!comment] NAME | DATE` callout, hidden in Reading mode. It is block-level with no Target. Last push 2025-06, and open bugs include #7 "pane disappears when re-opening vault".

## 2. CriticMarkup

### The spec

Source: [CriticMarkup-toolkit README](https://github.com/CriticMarkup/CriticMarkup-toolkit/blob/master/README.md) (2013, Apache-2.0).

- There are five marks: addition `{++ ++}`, deletion `{-- --}`, substitution `{~~ ~> ~~}`, comment `{>> <<}`, and highlight `{== ==}{>> <<}`.
- Highlight: "While a highlight can be used on it's own, we recommend that it always be followed by a comment related to the highlighted passage." **This is exactly a Target plus an Instruction.**
- A comment renders as an inline `<span class="critic comment">`, so "all newlines will be stripped during conversion to HTML."
- Caveats in the spec itself: "**Newlines should be avoided as much as possible within CriticMarkup tags**", and "**Wrap Markdown tags completely**". A mark that cuts through `*italic*` "chokes" the processor.
- The spec has no authors, IDs, timestamps, or threads. Every plugin below extends it in a different, incompatible way:
  - Review Comments: `{>>id|author|date|TYPE: text<<}`
  - Inkling: `{>>{"author":..}@@text<<}`, or a trailing `{author=".."}` block
  - Relay Comments: `{{authorId=".." author="..">>text<<}}`
- It is portable outside Obsidian through Pandoc filters, MultiMarkdown, and pandiff (the spec README links these). Read without a renderer, `{==...==}{>>...<<}` is noisy but readable.

### Obsidian CriticMarkup plugins

| Plugin (id) | Repo | In registry | Mobile flag | Stars | Created / last push | Notes |
|---|---|---|---|---|---|---|
| Commentator (`commentator`) | [Fevol/obsidian-criticmarkup](https://github.com/Fevol/obsidian-criticmarkup) | **No** (BRAT only) | ok | 262 | 2023-02 / 2026-08 (v0.2.7) | Most mature. LP + Reading rendering; comments in right gutter and on hover; vault-wide sidebar view. Suggestion-mode focused. README: "you should not use this plugin in your main vault. There is a non-zero risk of text being removed". Roadmap leaves "Comment Mode → Add comments to selection" unchecked. Open: #35 "Editing comments does not work", #48 annotations in tables, #36 IME, #38 multi-cursor, #39 Vim. |
| Inkling Markup (`inkling-markup`) | [andrewbroz/obsidian-inkling](https://github.com/andrewbroz/obsidian-inkling) | Yes | ok | 0 | 2026-07 / 2026-10 | Fork of Commentator; adds selection-anchored comments and a comment-only Reviewer mode; guards edits that would corrupt the syntax. |
| Track Changes (`track-changes`) | [philphilphil/obsidian-track-changes](https://github.com/philphilphil/obsidian-track-changes) | Yes | ok | 15 | 2026-05 / 2026-10 | Side panel with accept/reject/reply; click a mark in LP to edit in place; Reading mode shows accepted or raw; code blocks skipped. Open: **#17 "CriticMarkup does not render correctly inside Markdown tables"**. Fixed: #49 (Reading view put marks in the wrong place when mixed in a list block), #22 (marks after fenced code silently dropped), #8 (backticks inside a mark). Aimed at AI review. |
| Review Comments (`review-comments`) | [ShotaShirai1719/obsidian-review-comments](https://github.com/ShotaShirai1719/obsidian-review-comments) | Yes | ok | 6 | 2026-05 / 2026-09 | `{==text==}{>>id\|author\|date\|TYPE: body<<}`; markup hidden, bubble icon opens popover; edits happen in the side panel only. Resolve removes the markup and appends the thread to a "resolved comments" file. |
| Review Comments AI (`review-comments-ai`) | [mikegafert/obsidian-review-comments-ai](https://github.com/mikegafert/obsidian-review-comments-ai) | Yes | ok | 0 | 2026-08 / 2026-09 | Derivative of the above; threads as chained `{>>...<<}`; panel scoped to note/folder/vault. |
| Agent Comments (`inline-comments`) | [ivyyang1999/obsidian-inline-comments](https://github.com/ivyyang1999/obsidian-inline-comments) | Yes | ok (README: "desktop and mobile") | 0 | 2026-07 / 2026-10 | Card in right sidebar aligned with the passage; same highlight in Reading view with markup hidden. Agent features are desktop-only. |
| Inline Notes (`inline-notes`) | [arkkwang/obsidian-inline-notes](https://github.com/arkkwang/obsidian-inline-notes) | Yes | ok | 0 | 2026-10 / 2026-10 | Typed comments. README limitations: editing is LP-only; "Annotations crossing Markdown formatting nodes or paragraphs may remain raw" in Reading view; no partial overlaps or nesting; "Mobile usability is unverified." |
| Review Critic (`review-critic`) | [rohrbachd/obsidian-review-critics](https://github.com/rohrbachd/obsidian-review-critics) | Yes | ok | 3 | 2026-04 / 2026-07 | Protects "tables/headings/lists/callouts/code fences/links/footnotes" by refusing to inject tokens there. Open #7: tracking mode doesn't intercept edits and manual tokens aren't decorated. |
| Relay Comments (`relay-comments`) | [no-instructions/Relay-Comments](https://github.com/no-instructions/Relay-Comments) | Yes | ok | 4 | 2026-07 / 2026-10 | Hover preview, sidebar with resolve; attaches to native `==highlight==` too; built around the Relay collaboration service. |
| kometenstaub CriticMarkup | [kometenstaub/obsidian-criticmarkup](https://github.com/kometenstaub/obsidian-criticmarkup) | No | — | 8 | 2022 / **archived** | Prototype that Commentator grew from. |

## 3. Other in-note comment formats

- **Document Comments** (`document-comments`, [kylemcd/obsidian-document-comments](https://github.com/kylemcd/obsidian-document-comments)). Storage is HTML comments: `<!--c:ID-->Target<!--/c:ID-->` with a separate `<!--co:ID by:.. at:.. status:open quote:".."-->` thread block. The raw text is invisible in any Markdown renderer, which makes it clean but hard to read raw. It writes a **zero-width space** before a marker at the start of a paragraph, list item, or quote, because a line starting with `<!--` is parsed as an HTML block. It supports comments on prose, inline code, tables, and fenced-code lines; cards in LP, Source, and Reading; a sidebar; and desktop and mobile (mobile uses a dialog). 27 stars, active, 12 open issues. Table and formatting problems: #79 "Comments doesn't work well with markdown tables", #28 popup in tables, #94 a comment at paragraph start disabled highlighting for the rest of the paragraph in Reading mode, **#110 (open) "Reading view: selections that cross inline formatting can't be commented"**, #111 (open) selection drift, #83 cards vanish when the pane is narrow, #85 iPad sidebar scrolling.
- **Inline Annotations** (`inline-annotations`, [cetrodk/obsidian-inline-annotations](https://github.com/cetrodk/obsidian-inline-annotations)). Storage is `{Target::note}`. Only the Target shows in LP and Reading, and click or hover opens a popup. Both parts must stay on one line. It skips code, math, and frontmatter. It has no sidebar. 8 stars. **This is the closest existing analogue to the `{target}(instruction)` candidate.** I found no registry plugin that uses `{target}(instruction)` itself. Note that `]( )` and `}( )` are close to Markdown link syntax.
- **Reading Comments** (`reading-comments`, [bumbrt/obsidian-reading-comments](https://github.com/bumbrt/obsidian-reading-comments)). Storage is an HTML `<div class="ob-html-comment" ... data-tags=...><span class="ob-html-comment-body">..</span>Target</div>`. It is created from Reading view and hides the comment until hover. The raw file is noisy. Last push 2024-12.
- **Note Comments** ([rafamss/obsidian-note-comments](https://github.com/rafamss/obsidian-note-comments)). A readable callout plus a hidden `%% ... %%` JSON block as the source of truth. 0 stars.

## 4. Out-of-note storage (fails "readable without the plugin")

These meet the UI requirements but keep the Instruction outside the note:

| Plugin | Storage | Mobile | Notes |
|---|---|---|---|
| SideNote (`side-note`, [mofukuru/side-note](https://github.com/mofukuru/side-note)) | `data.json` with offsets + SHA256 of the Target; optional per-note Markdown files in a separate folder | ok; #23 lag on Android | 30 stars, active. History of anchoring bugs: #1 rename loses notes, #4 brittle anchoring, #15 orphaned comments, #35 table display. |
| Margin Comments (`margin-comments`, [jonaas-dev/obsidian-margin-comments](https://github.com/jonaas-dev/obsidian-margin-comments)) | JSON in `.margin-comments/`, anchored by quote ± ~50 chars | ok | README: "Obsidian Sync skips folders that start with a dot, so with Obsidian Sync your comments stay on the device where you wrote them." |
| HiNote (`hi-note`, [catmuse/HiNote](https://github.com/catmuse/HiNote)) | `==highlight==` in note; comments in `.hinote/` | ok | 259 stars, active; reading/study oriented (flashcards, AI). |
| Annotation Marker (`annotation-marker`, [uuq007/obsidian-annotation-marker](https://github.com/uuq007/obsidian-annotation-marker)) | Separate annotation files | ok, with touch-specific UX (long-press, tap for menu) | 63 stars. Good reference for mobile interaction. |
| Lemon Comments, Side Thing, Article Annotator, Side Comments | `data.json` / vault JSON | mixed; Side Comments is desktop-only; Article Annotator is not visible in Reading mode | Small, new. |

## Breakage patterns (cross-plugin)

1. **Tables.** Table cells are single-line and `|`-delimited. Marks inside them misrender or pick up stray annotations: Track Changes #17 (open), Commentator #48 (open), Document Comments #79/#28, SideNote #35. Review Critic avoids this by refusing to mark tables at all.
2. **Targets that cross formatting or blocks.** The CriticMarkup spec warns against both. Reported in Inline Notes (README), Document Comments #110, Track Changes #49 (lists mixed with marks), and Arkkwang's "partial overlaps and nested highlights are not supported."
3. **Line-start markers.** HTML-comment markers at line start turn into HTML blocks (Document Comments' zero-width-space workaround, #94).
4. **Code.** Most plugins skip code blocks on purpose. Track Changes #22 (CRLF and indented fences dropping marks) and Enhanced Annotations #25 show how parsing goes wrong around them.
5. **Multi-line Instructions.** The spec strips newlines, footnote definitions are single-line unless indented, `{a::b}` must stay on one line, and Cornell #21 reports multi-line notes vanishing in Reading view.
6. **Editor interaction.** IME, Vim, and multi-cursor all break Commentator's suggestion mode (#36, #39, #38). These are mostly a suggestion-mode problem, not a comment problem.
7. **Mobile.** Few plugins verify it. Explicitly desktop-only: Enhanced Annotations, Side Comments. Explicitly unverified: Inline Notes, Marginalia MD. Tested touch flows: Annotation Marker, Document Comments, Sidebar Highlights.

## What gap a new plugin would fill

Requirements from the project brief: plain text in the note, raw file readable without the plugin, a Target plus a free-text Instruction, inline + hover/tap + sidebar reading and editing, Live Preview + Reading view, desktop + mobile. How the closest candidates fall short:

- **Commentator** comes closest on features but is not in the registry, is labelled data-risky beta, has broken comment editing (#35), and is built around track changes.
- **The 2026 CriticMarkup review plugins** (Track Changes, Review Comments, Agent Comments, Inline Notes, Inkling) cover most of the surface but are months old with 0–15 stars. Each invents its own metadata extension inside `{>>...<<}`. They are aimed at AI agents rather than human Reviewers, and the table and cross-formatting bugs are still open.
- **Document Comments** has the best breadth (tables, code, LP/Source/Reading, mobile), but its HTML-comment storage is invisible in any rendered view and cluttered in raw text. The Instruction sits in a separate block away from the Target.
- **Sidebar Highlights** (`==Target==[^n]`) uses only native syntax and is mature, but it is a browser, not an inline or hover editor, and the Instruction sits at the bottom of the note.
- **Inline Annotations** (`{Target::note}`) is the most readable raw syntax, but it has no sidebar and only single-line Instructions.
- **Out-of-note plugins** (SideNote, Margin Comments, HiNote, Annotation Marker) have the richest UIs but fail the plain-text requirement.

The open niche is a stable, registry-listed plugin built for human Reviewers. It would store one readable Target-plus-Instruction pair inline. A well-behaved CriticMarkup subset `{==…==}{>>…<<}` is the best-supported option for interoperability. Footnotes or a `{target}(instruction)`-style form are better for raw readability. It would offer inline, hover/tap, and sidebar editing in both views and on mobile, and handle tables, lists, callouts, and formatting-crossing Targets deliberately, which every existing tool currently gets wrong in some way.

## Open questions for later tickets

- Which storage format: a CriticMarkup subset (interoperable with the plugins above and Pandoc) or something more readable? This research favours a CriticMarkup subset on ecosystem grounds and leaves the decision to the format ticket.
- Policy for Targets in tables, across formatting, and across blocks: refuse (Review Critic), split, or degrade.
- Whether to stay compatible with metadata extensions (IDs, authors, threads). The brief specifies one free-text Instruction per Annotation, so the plain spec form may be enough.
