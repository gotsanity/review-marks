// PROTOTYPE (throwaway). Live Preview Backspace just after an Annotation's hidden closing syntax.
// With the cursor right after `}[^rN]` the syntax is hidden (the cursor counts as outside), so a plain
// Backspace would eat an invisible ']'. Instead it deletes the last character of the Target:
//   {abc}[^r1]|  ->  {ab}[^r1]|
// If that would leave the Target empty, the whole Annotation goes in one undo step: the character,
// the braces, the marker and the definition. Visible syntax (cursor inside) and Source mode: normal Backspace.
import { editorLivePreviewField } from 'obsidian';
import { EditorSelection, Prec, findClusterBreak } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { annotationsField } from './render-live';
import { isTableLine } from './parse';
import { unwrapChanges } from './sidebar';

function run(view: EditorView): boolean {
  const s = view.state;
  if (!s.field(editorLivePreviewField, false)) return false;
  if (s.selection.ranges.length !== 1 || !s.selection.main.empty) return false;
  const pos = s.selection.main.head;
  const anns = s.field(annotationsField, false);
  if (!anns) return false;
  let a = anns.find((x) => x.open >= 0 && x.refEnd === pos);
  // Tables are drawn by Obsidian's widget; the cursor there is in a cell editor showing raw text.
  if (!a || isTableLine(s.doc.lineAt(a.close).text)) return false;
  // Nested Annotations ending together, {{x}[^r1]}[^r2]|: go into the innermost Target.
  for (let inner; (inner = anns.find((x) => x.open >= 0 && x.refEnd === a!.close));) a = inner;
  const text = s.doc.sliceString(a.open + 1, a.close);
  if (!text) return false;
  let from = a.open + 1 + findClusterBreak(text, text.length, false);
  if (from > a.open + 1 && s.doc.sliceString(from - 1, from) === '\\') from--; // don't leave a lone '\' escaping '}'
  if (from > a.open + 1) {
    view.dispatch({
      changes: { from, to: a.close },
      selection: EditorSelection.cursor(pos - (a.close - from)),
      userEvent: 'delete.backward',
      scrollIntoView: true,
    });
    return true;
  }
  // The Target would be empty: remove the Annotation whole.
  const ch = unwrapChanges(s.doc.toString(), a.id);
  if (!ch) return false;
  const changes = ch.map((c) => (c.from === a!.close ? { from: a!.open + 1, to: c.to } : c));
  view.dispatch({
    changes,
    userEvent: 'input.unwrap', // not a 'delete' event, so history never joins it with the Backspaces before
    scrollIntoView: true,
  });
  return true;
}

export const backspaceExtension = Prec.highest(keymap.of([{ key: 'Backspace', run }]));
