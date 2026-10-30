// PROTOTYPE: one-off generator for the two test notes, from the repo's sample-document.md.
// Usage: node make-notes.mjs
//   vault/Review sample - end of note.md     all definitions at the end of the note
//   vault/Review sample - end of section.md  each definition at the end of its Target's section
import fs from 'fs';

const src = new URL('../../../../sample-document.md', import.meta.url);
let t = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n').replace(/\n+$/, '\n');
const defs = []; // { id, text }
let n = 0;

function def(id, comment) {
  const lines = comment.split('\n');
  defs.push({ id, text: `[^${id}]: ` + lines[0] + lines.slice(1).map((l) => '\n    ' + l).join('') });
}
function wrap(target, comment, after) {
  const id = 'r' + ++n;
  const i = t.indexOf(target, after ? t.indexOf(after) : 0);
  if (i < 0) throw new Error('not found: ' + target);
  t = t.slice(0, i) + '{' + target + '}[^' + id + ']' + t.slice(i + target.length);
  def(id, comment);
}

wrap('Caly frenzies and Malek knocks her out.', 'Too terse. Say why Malek had to: she punched Rhiaah.');
wrap("Caly studied Kell's wounds knitting shut (Medicine 19)", 'Move the roll result to the Roll Log; keep prose clean.');
wrap("**Call of the Void.** Vance's grey mist", 'Label should match the scene title.');
wrap('spreads his palms like a salesman', 'Keep this, good image.');
wrap('Vance rolls a 26 on initiative.', 'Cut. Already in the Roll Log.');
wrap('his eyes burning with hatred', 'Check the recording (~00:04): was it "hatred" or "contempt"? Don\'t add {flavour} or [[links]] here.');
wrap('Rhiaah tells him there is a task he needs done', 'Rewrite as a direct quote.\nShe said it in character; see the transcript.');
wrap('[[malas-vance\\|Malas Vance]] (the Peddler)', 'Use "Vance" consistently; drop "the Peddler".');
wrap('17 (fail)', 'Was this a fail? DC was 18 per the transcript.', '## 9. Roll Log');
wrap("**Malek's last potion.**", 'Which potion? Greater healing?');
{
  // Case 11: one span across two list items. '{' after the first item's "- ", '}[^r11]' in the second.
  n++;
  const a = '**Burnside** left with six carts';
  const b = '**The two people who escaped the mine**';
  const i = t.indexOf(a), j = t.indexOf(b) + b.length;
  t = t.slice(0, i) + '{' + t.slice(i, j) + '}[^r11]' + t.slice(j);
  def('r11', "Merge these two threads; it's the same ghost iron.");
}
// Case 12: inside the heading text.
wrap('Call of the Void', 'Rename this scene. It collides with the world-fact label above, and readers skimming the table of contents will think they\'re the same section. Something like "The Grey Mist" works, or name it after Kell.', '### Scene 3: ');

const r9Note = '<!-- PROTOTYPE NOTE: r9 targets the first of two "17 (fail)" cells in the Roll Log (Doreth Kell, Wisdom save). The second one (Constitution save) is not annotated. -->\n';

// End of note: definitions in id order after the content.
const endOfNote = t + '\n' + defs.map((d) => d.text).join('\n') + '\n\n' + r9Note;

// End of section: each definition before the next heading after its marker.
const heads = [];
for (const m of t.matchAll(/^#{1,6} /gm)) heads.push(m.index);
const byPos = new Map(); // insertion offset -> defs
for (const d of defs) {
  const close = t.indexOf(`}[^${d.id}]`);
  const next = heads.find((h) => h > close) ?? t.length;
  if (!byPos.has(next)) byPos.set(next, []);
  byPos.get(next).push(d.text);
}
let endOfSection = t;
for (const at of [...byPos.keys()].sort((a, b) => b - a)) {
  let ce = at;
  while (ce > 0 && /\s/.test(endOfSection[ce - 1])) ce--;
  endOfSection = endOfSection.slice(0, ce) + '\n\n' + byPos.get(at).join('\n') + endOfSection.slice(ce);
}
endOfSection = endOfSection.replace(/\n*$/, '\n') + '\n' + r9Note;

fs.writeFileSync(new URL('../../vault/Review sample - end of note.md', import.meta.url), endOfNote);
fs.writeFileSync(new URL('../../vault/Review sample - end of section.md', import.meta.url), endOfSection);
console.log('wrote 2 notes,', defs.length, 'annotations');
