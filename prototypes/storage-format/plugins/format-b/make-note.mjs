// PROTOTYPE: one-off generator for vault/B-footnote-end.md from the repo's sample-document.md.
// Usage: node make-note.mjs
import fs from 'fs';
const src = new URL('../../../../sample-document.md', import.meta.url);
const out = new URL('../../vault/B-footnote-end.md', import.meta.url);
let t = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n');
const defs = [];
let n = 0;
function def(id, instr) {
  const lines = instr.split('\n');
  defs.push(`[^${id}]: ` + lines[0] + lines.slice(1).map(l => '\n    ' + l).join(''));
}
function wrap(target, instr, after) {
  const id = 'r' + ++n;
  const i = t.indexOf(target, after ? t.indexOf(after) : 0);
  if (i < 0) throw new Error('not found: ' + target);
  t = t.slice(0, i) + '{' + target + '}[^' + id + ']' + t.slice(i + target.length);
  def(id, instr);
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
  // Case 11 crosses two list items: one brace pair spanning the line break.
  n++;
  const a = '**Burnside** left with six carts';
  const b = '**The two people who escaped the mine**';
  const i = t.indexOf(a), j = t.indexOf(b) + b.length;
  t = t.slice(0, i) + '{' + t.slice(i, j) + '}[^r11]' + t.slice(j);
  def('r11', "Merge these two threads; it's the same ghost iron.");
}
wrap('Call of the Void', 'Rename this scene. It collides with the world-fact label above, and readers skimming the table of contents will think they\'re the same section. Something like "The Grey Mist" works, or name it after Kell.', '### Scene 3: ');
t = t.replace('[^r12] (~00:41--00:50)\n', '[^r12] (~00:41--00:50)\n<!-- PROTOTYPE NOTE: r12 puts the braces and the footnote marker inside the heading text. The outline, heading links ([[#...]]) and the heading anchor all see "{Call of the Void}[^r12]", so any existing link to this heading breaks while the Annotation exists. -->\n');
t = '---\nreview-format: B\n---\n' + t.replace(/\n+$/, '\n') + '\n' + defs.join('\n') + '\n'
  + '\n<!-- PROTOTYPE NOTE: r6\'s Instruction contains [[links]]. In a footnote definition Obsidian treats it as a real wikilink: it renders as a link in Reading view and shows up as an unresolved link in the graph and in "links" searches. -->\n'
  + '<!-- PROTOTYPE NOTE: r9 targets the first of two "17 (fail)" cells in the Roll Log (Doreth Kell, Wisdom save). The second one (Constitution save) is not annotated. -->\n';
fs.writeFileSync(out, t.replace(/\n/g, '\r\n'));
