# Project status and handoff notes

The state of the project, and the context that isn't in the code, `CLAUDE.md` or the issue tracker. Last updated 2026-10-31 (BRAT test passed).

## Where things stand

- **Released:** Review Marks **0.1.0**, tag `0.1.0`, with `main.js`, `manifest.json` and `styles.css` attached. It was built while the repo was private, so it has **no build attestation**.
- **Public:** the repo was made public on 2026-10-31 so that the plugin can be tested with BRAT (`gotsanity/review-marks`) without a token.
  - The user knowingly accepted that git history exposes their commit email and `sample-document.md`, which contains real TTRPG session notes with player names.
  - Don't rewrite history or remove these without asking.
- **v1 is complete:** every ticket of [Spec: Review Marks v1](https://github.com/gotsanity/review-marks/issues/18) (#19–#31) is merged through PR #32 and closed.
- **Open issue:** [#34 Fix IDs sometimes does nothing (flaky on 1.7.4)](https://github.com/gotsanity/review-marks/issues/34), labelled `needs-triage`. It might be test noise, or a real timing bug where the sidebar acts on a stale parse.

## Next steps (the user's plan)

1. ~~Test 0.1.0 with BRAT~~: **done 2026-10-31**. The user reports it works fine. Confirm whether a **real phone** was included; mobile was otherwise only tested in emulation.
2. **Triage #34** if it shows up in real use.
3. **Verify attestation on the next release:** it's the first one cut since the repo went public. Run `gh attestation verify main.js -R gotsanity/review-marks`.
4. **Submit to the community directory** following "Before publishing" in `CLAUDE.md`. Recheck that the id `review-marks` is still free.

## Where decisions live

- **The why behind every decision:** the closed map [Wayfinder: Review markup plugin v1 spec](https://github.com/gotsanity/review-marks/issues/1). Its "Decisions so far" links each closed decision ticket (#2–#16), and each resolution comment holds the full answer.
- **What v1 does:** [Spec: Review Marks v1](https://github.com/gotsanity/review-marks/issues/18), with 70 user stories, implementation and testing decisions, and the out-of-scope list.
- **The storage format:** `docs/adr/0001-footnote-storage-format.md`.
- **Vocabulary:** `GLOSSARY.md`. "Comment" replaced the old term "Instruction". The UI says "annotation" and "comment".
- **Decisions made after the spec** are in the PR #32 description and its comments:
  - the "at cursor" and "Fix IDs" sentence-case lint warnings are false positives, accepted;
  - export shows Targets without highlighting them;
  - a Target that runs into a table row is refused;
  - Fix IDs pairs a later duplicate marker with the later duplicate definition, in file order;
  - whole-line Dataview fields refuse annotation starts and ends;
  - bare URLs and author `[^n]` refs count as link syntax;
  - clearing a comment and clicking away keeps the old comment and shows a notice;
  - the badge uses the highlight colour.
- **Reference branches on GitHub** (throwaway, never merged):
  - `prototype/storage-format`: the B+ prototype and its README;
  - `research/*`: the research notes.

## Things that bite

- **The Linux end-to-end CI job is non-blocking** (`continue-on-error`). CI's herbstluftwm tiles every Obsidian window to 1274x480, so layout-dependent specs are flaky there; table-cells r9 on 1.14.5 is the usual one. The mobile "above the keyboard" spec is skipped on Linux CI. Everything passes locally on Windows on 1.7.4 and 1.14.5. If you change this, see `ci.yml`.
- **End-to-end vault resets:** always use `resetVaultTo(files)` from `test/e2e/harness.ts`. wdio-obsidian-service's object-only `resetVault({...})` deletes `.obsidian` and Obsidian reloads default settings mid-test. A lint rule blocks the old call.
- **Running a test Obsidian on Windows:**
  - Every launch re-points the `obsidian://` handler (`HKCU\Software\Classes\obsidian\shell\open\command`). The harness backs it up and restores it, but parallel runs once left it pointing at a deleted test build.
  - The correct value is `"C:\Program Files\Obsidian\Obsidian.exe" "%1"`.
  - In Git Bash, run `reg` with `MSYS_NO_PATHCONV=1` or its `/ve` and `/f` flags get mangled.
  - Agents are blocked from writing that registry key, so ask the user to run it.
- **Never touch the user's own Obsidian install, config, running instance or vaults** in tests. Use a separate `--user-data-dir` and a temp vault, launched with background throttling disabled. The flags are in `CLAUDE.md` > Testing.
- **`obsidian` typings are pinned to 1.7.2**, because npm has no 1.7.4 typings, while `minAppVersion` is 1.7.4.
- **Merging PRs:** use **merge commits, not squash**, so release-please sees each `feat:` and `fix:`. Merge commits are exempt from commitlint.
- **Release PRs:** they're opened with `GITHUB_TOKEN`, so the user must click "Approve workflows to run" before their CI starts.

## How the user likes to work

- **Planning:** wayfinder maps on GitHub Issues, with grilling rounds: numbered questions, each with a recommended answer. Decisions that need the user come to them **as they arise**.
- **Building:** orchestrate subagents in parallel across a task graph. All work is in **vertical slices**, built test-first, on an integration branch with one draft PR that closes the spec and its tickets. Merges are serialized, one merger agent at a time.
- **Skills only the user can start:** `to-spec`, `to-tickets`, `triage`, `implement` and `implement-spec` set `disable-model-invocation`. Ask the user to type the slash command.
- **Identity:** nothing in the plugin's name, UI or docs refers to agents or AI. It's a neutral tool for marking up text during review.
