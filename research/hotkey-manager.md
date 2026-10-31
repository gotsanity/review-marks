# Research: Obsidian's internal hotkey manager, 1.7.4 to latest

Ticket: [#37](https://github.com/gotsanity/review-marks/issues/37). Researched 2026-10-31.

## Sources

| Source | Version | How it was read |
| --- | --- | --- |
| Obsidian `app.js` | 1.7.4 (`minAppVersion`) | `obsidian-1.7.4.asar.gz` from the `v1.7.4` release of `obsidianmd/obsidian-releases`, unpacked, minified code read directly |
| Obsidian `app.js` | 1.14.5 (latest per `desktop-releases.json` on 2026-10-31) | same, from `v1.14.5` |
| `obsidian` typings | 1.7.2 (pinned) and 1.14.4 (npm `latest`) | `npm pack obsidian@…`, `obsidian.d.ts` and `CHANGELOG.md` |
| Hotkey Helper (`pjeby/hotkey-helper`) | HEAD 2026-09-19 | `src/hotkey-helper.ts`, `src/obsidian-internals.ts` |
| Commander (`phibr0/obsidian-commander`) | HEAD 2026-10-15 | `src/manager/commands/emptyStateManager.ts`, `src/types.ts` |
| Hotkeys for specific files (`Vinzent03/obsidian-hotkeys-for-specific-files`) | HEAD 2024-01-29 | `src/main.ts` |
| `eslint-plugin-obsidianmd` (`obsidianmd/eslint-plugin`) | HEAD 2026-10-07 | `lib/index.ts`, `lib/rules/**` |
| Plugin guidelines (`obsidianmd/obsidian-developer-docs`) | HEAD | `en/Plugins/Releasing/Plugin guidelines.md` |

Minified names differ between builds (`JD`/`dD` for the manager, `$D`/`cD` for the printer). The method and property names below are the real, unminified names, and they are the same in both builds.

## 1. Reading, setting, clearing and saving hotkeys

`app.hotkeyManager` is created in the `App` constructor in both builds (`this.hotkeyManager=new JD(this)` in 1.7.4, `new dD(this)` in 1.14.5). Its class is identical in 1.7.4 and 1.14.5, apart from how `onRaw` matches the file path:

```ts
interface HotkeyManager {
  defaultKeys: Record<string, Hotkey[]>;      // from Command.hotkeys
  readonly customKeys: Record<string, Hotkey[]>; // getter, returns a shallow COPY
  getHotkeys(id: string): Hotkey[] | undefined;        // custom only; the live array
  getDefaultHotkeys(id: string): Hotkey[] | undefined; // defaults only
  setHotkeys(id: string, hotkeys: Hotkey[]): void;     // in memory; marks baked=false
  removeHotkeys(id: string): void;                     // deletes the custom entry
  addDefaultHotkeys(id: string, hotkeys: Hotkey[]): void;
  removeDefaultHotkeys(id: string): void;
  printHotkeyForCommand(id: string): string;           // first effective hotkey as text, or ""
  save(): Promise<void>;  // vault.writeConfigJson("hotkeys", customMap) -> .obsidian/hotkeys.json
  load(): Promise<void>;  // readConfigJson("hotkeys"); called (debounced 50 ms) when hotkeys.json changes on disk
  bake(): void;           // rebuilds the lookup table; called lazily on the next key event
}
```

What this means in practice:

- **Custom storage is behind a `Symbol("customKeys")` in both versions.** `customKeys` is a getter that returns `Object.assign({}, this[symbol])`, so writing `hotkeyManager.customKeys[id] = …`, which some older plugins did, does nothing. Use `setHotkeys` and `removeHotkeys`.
- **Effective hotkeys** = `getHotkeys(id) ?? getDefaultHotkeys(id)`. A custom entry, even an empty array, overrides the defaults completely (`bake` skips defaults when the custom map `hasOwnProperty(id)`).
- **Set:** `setHotkeys(id, [...next])`, then `await save()`. Pass a new array: the manager keeps the reference, and `getHotkeys` returns that same live array, so copy it before mutating.
- **Clear:** what Obsidian's own tab does when the last hotkey is removed: `removeHotkeys(id)` when the command has no defaults, `setHotkeys(id, [])` when it has defaults (an explicit empty override). "Restore default" is `removeHotkeys(id)`. Review Marks registers no default hotkeys (see `src/commands/*.ts`), so clearing is always `removeHotkeys(id)` + `save()`.
- **Persistence and visibility in the Hotkeys tab:** `save()` writes the whole custom map to `<configDir>/hotkeys.json`. The Hotkeys tab keeps no cache: in 1.7.4 `display()` calls `updateHotkeyVisibility()`, and in 1.14.5 `display()` calls `onHotkeysChanged()`, and both read `getHotkeys`/`getDefaultHotkeys` live. Our tab and the Hotkeys tab are panes of the same Settings modal, so changes made through the manager show up the next time the Hotkeys tab is opened. Key handling uses them immediately, because `setHotkeys` and `removeHotkeys` mark the table un-baked. The manager emits no change event. If our section must react to edits made in the Hotkeys tab, it re-reads in `display()`. This is confirmed by reading the code, not by a run. An e2e check is cheap: call `setHotkeys` + `save`, `openTabById('hotkeys')`, then assert on the row's `.setting-hotkey` text and on `obsidianPage.read('.obsidian/hotkeys.json')`.
- On desktop, `setHotkeys` also calls `app.appMenuBarManager.requestRender()` (both versions). Nothing to do on our side.

None of this is in the public typings, at 1.7.2 or at 1.14.4: `App` has no `hotkeyManager` or `setting` field. It has to be declared locally and reached through a cast, which belongs in `src/guards.ts`.

## 2. How a hotkey is represented and rendered

**Representation.** The public `Hotkey` interface, identical in 1.7.2 and 1.14.4: `{ modifiers: Modifier[]; key: string }`, where `Modifier = 'Mod' | 'Ctrl' | 'Meta' | 'Shift' | 'Alt'`. `hotkeys.json` stores exactly that, keyed by command id, e.g. `{"review-marks:annotate-selection":[{"modifiers":["Mod","Shift"],"key":"A"}]}`. Internally a hotkey may also carry `code` (a `KeyboardEvent.code`); `bake` and the printer prefer `code` over `key` when it is present. The Hotkeys tab never writes `code`.

**Recording**, in Obsidian's Hotkeys tab (same logic in both versions): it pushes a `Scope` with `app.keymap.pushScope(scope)` and registers a catch-all `scope.register(null, null, (evt, ctx) => …)`. From the `KeymapContext` it builds:

- `modifiers = Keymap.decompileModifiers(ctx.modifiers)`. `ctx.modifiers` is the compiled, sorted, comma-joined string (e.g. `"Alt,Ctrl,Shift"`). Decompiling maps `Meta`→`Mod` on macOS and `Ctrl`→`Mod` elsewhere.
- `key = ctx.vkey`. The virtual key comes from `keyCode` (letters upper-case `"A"`, `"F5"`, `"ArrowUp"`, `"/"`; unknown codes become `"Key<n>"`).
- It **rejects** hotkeys with no modifier unless the key is `F1`…`F24`, and rejects `Shift` + a single letter. It **skips duplicates** (compared by printed text), appends, then `setHotkeys` + `save()`. `Escape` cancels. When done it calls `popScope`.

Public pieces we can reuse: `Scope`, `Scope.register`, `app.keymap.pushScope/popScope`, `KeymapContext.vkey` and `KeymapInfo.modifiers` are all in the 1.7.2 typings. `Keymap.compileModifiers`/`decompileModifiers` exist at runtime in both versions but are **not** in the typings. The decompile step is three lines, so reimplement it with `Platform.isMacOS`. There is no reusable recorder component: the recorder is inline in the Hotkeys tab class.

**Rendering.** There is no public function. The internal printer (`$D` in 1.7.4, `cD` in 1.14.5, identical) works like this:

- Modifiers are printed in the fixed order `["Mod","Ctrl","Meta","Alt","Shift"]`, each one present in the hotkey mapped through:
  - macOS: `{Mod:"⌘", Ctrl:"⌃", Meta:"⌘", Alt:"⌥", Shift:"⇧"}`
  - others: `{Mod:"Ctrl", Ctrl:"Ctrl", Meta:"Win", Alt:"Alt", Shift:"Shift"}`
- Key: `code` (with `"KeyX"` shortened to `"X"`) or `key`. Then `{ArrowLeft:"←", ArrowRight:"→", ArrowUp:"↑", ArrowDown:"↓", " ":"Space"}` is applied, otherwise camel case is split and capitalised (`"PageUp"` becomes `"Page Up"`).
- Parts are joined with `" "` on macOS and `" + "` elsewhere: `"⌘ ⇧ A"` and `"Ctrl + Shift + A"`.

The only exposed path to this printer is `app.hotkeyManager.printHotkeyForCommand(id)`, which prints the **first** effective hotkey only. Commander uses exactly that. To list every hotkey of a command, port the printer, which is about 15 lines and pure, so it can go in a unit-tested module. Display text from Obsidian's tab will then match ours.

## 3. Conflict detection

The logic is inline in the tab and cannot be called:

- 1.7.4: inside `updateHotkeyVisibility()`, it builds a multimap from printed hotkey to command names over `app.commands.commands`, using custom hotkeys if defined, else defaults. A hotkey "conflicts" when its printed text maps to another command name.
- 1.14.5: the same idea moved into `recomputeConflicts()`, which sets `this.hotkeyToCommands` and `this.conflicts`, and adds a "Show conflicts" filter. The fields live on the tab instance, which exists only while Settings is open, so they are not usable from our side either.

Reimplementing it is cheap and safe: iterate `app.commands.commands` (internal, but used by every hotkey plugin), take `getHotkeys(id) ?? getDefaultHotkeys(id) ?? []`, and key by the printed string (or by a normalised `sorted modifiers + "," + key.toLowerCase()`, as Hotkey Helper's `hotkeyToString` does). Two details to match Obsidian: an empty custom array means "no hotkeys", and comparison happens on printed text, so `code`- and `key`-based hotkeys that print the same count as equal.

## 4. Fallback: open Settings on the Hotkeys tab, filtered

The `app.setting` object (internal, `App` constructor in both builds):

- `app.setting.open()` opens the modal. The core command `app:open-settings` calls exactly this in both versions.
- `app.setting.openTabById(id)` returns the tab or `null`. In 1.7.4 it loops over `settingTabs` then `pluginTabs`. In 1.14.5 it goes through a new `findTabById`. Both call `openTab(tab)`, which calls `tab.display()`.
- The Hotkeys tab (`id === "hotkeys"`) has **`setQuery(query: string)` in both versions**. It sets `searchComponent.inputEl.value`, focuses it, and re-renders: `updateHotkeyVisibility()` in 1.7.4, `renderHotkeyList()` in 1.14.5. The render method was renamed, so call `setQuery`, not the render method.
- Search matching changed:
  - 1.7.4: `name.toLowerCase().contains(q) || id.startsWith(q)`, where `q` is the lower-cased query.
  - 1.14.5: `prepareSimpleSearch(q)` against the name or the id.

  Plugin command names are prefixed with the plugin name (`"Review Marks: Annotate selection"`), so the query **`"Review Marks"`** matches on both. `"review-marks:"` also works through the id on both.

Suggested guard:

```ts
export function openHotkeysFor(app: App, query: string): boolean {
  const setting = (app as unknown as { setting?: { open?(): void; openTabById?(id: string): unknown } }).setting;
  if (typeof setting?.open !== 'function' || typeof setting.openTabById !== 'function') return false;
  setting.open();
  const tab = setting.openTabById('hotkeys') as { setQuery?(q: string): void } | null;
  if (typeof tab?.setQuery === 'function') tab.setQuery(query);
  return tab != null;
}
```

Hotkey Helper's `showHotkeysFor` (`src/hotkey-helper.ts` ~L583) does the same thing, with a further fallback: it sets `searchComponent.inputEl.value` or the older `searchInputEl.value`, then calls `updateHotkeyVisibility?.()` or `renderHotkeyList?.()`. That suggests `setQuery` was missing in some build older than 1.7.4. It is present in both versions we support.

How fragile this is: low to moderate. `app.setting`, `open`, `openTabById` and the `"hotkeys"` id are the same in 1.7.4 and 1.14.5 and are relied on by several popular plugins. The tab internals (`searchComponent`, the render method) did change, so touch only `setQuery`, and feature-detect it. If `setQuery` is missing, the user still lands on the Hotkeys tab, just unfiltered.

## 5. What other plugins rely on, and what the review rules say

- **Hotkey Helper**: declares `app.hotkeyManager` with `getHotkeys`/`getDefaultHotkeys`, plus `app.setting` with `activeTab`, `openTabById`, `openTab`, `settingTabs` and `pluginTabs`, in `src/obsidian-internals.ts`. Uses `Keymap.compileModifiers` (untyped, at runtime) for its conflict key. Reads hotkeys only and leaves editing to Obsidian's tab.
- **Commander**: `app.hotkeyManager?.printHotkeyForCommand(id)`, optional-chained and declared locally in `src/types.ts`.
- **Hotkeys for specific files**: `(this.app as any).hotkeyManager.getHotkeys(id)` / `.setHotkeys(newId, hotkeys)` to carry hotkeys across a rename. It never calls `save()`, so its change lives in memory until something else saves. That is a bug to avoid: always `await save()`.
- A web search turned up a keyboard-analyzer plugin whose release notes say it edits through `app.hotkeyManager` with "explicit empty overrides" for default-only hotkeys, which matches section 1. I did not read its source.
- **Guidelines** (`Plugin guidelines.md`): the only hotkey rule is "Avoid setting a default hotkey for commands". Nothing forbids private or undocumented APIs.
- **eslint-plugin-obsidianmd** (`recommended`, which this repo extends):
  - `commands/no-default-hotkeys` (warn) flags `hotkeys:` in `addCommand`. It does not apply, since we set user hotkeys, not defaults.
  - `no-unsupported-api` (error) checks `@since` tags of **typed** members against `minAppVersion`. Untyped internals are invisible to it.
  - `@typescript-eslint/no-explicit-any` is `warn`. Declaring a narrow local interface and casting through `unknown`, as in the guard above, avoids it.
  - No rule targets `hotkeyManager` or `app.setting`.

## Recommendation

Go with the private API, behind a guard, with the fallback.

- The manager's surface (`getHotkeys`, `getDefaultHotkeys`, `setHotkeys`, `removeHotkeys`, `save`) is byte-for-byte the same logic in 1.7.4 and 1.14.5, and other plugins use it.
- In `src/guards.ts`, feature-detect `typeof hm?.setHotkeys === 'function'` etc. If any are missing, render the Hotkeys section as a single "Open Obsidian's Hotkeys settings" button that uses `openHotkeysFor(app, 'Review Marks')`.
- Build the recorder on the public `Scope` + `app.keymap.pushScope`, copying Obsidian's acceptance rules (needs a modifier unless it is an F-key, no Shift + single letter, `Mod` normalisation, de-duplication).
- Port the printer and the conflict check as pure, unit-tested functions.
- Add one e2e spec per version that sets and clears a hotkey through the section and asserts `hotkeys.json` plus the Hotkeys tab row.
