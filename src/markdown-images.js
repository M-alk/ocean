// The editor's image block keeps its size in the alt text (it writes "![1.00](...)"), which would wipe out
// alt text like "Slide 19". We translate on the way in and out so files keep normal Markdown:
//   file:   ![Slide 19](<x/slides/p19.jpg>)            or with a custom size: ![Slide 19](<...> "w=0.50")
//   editor: ![1](<x/slides/p19.jpg> "Slide 19")         (alt = size, title = caption shown under the image)
const DEST = String.raw`(<[^>\n]*>|[^\s)]+)`;
const IN = new RegExp(String.raw`^([ \t]*)!\[([^\]\n]*)\]\(${DEST}(?:\s+"((?:[^"\\]|\\.)*)")?\)[ \t]*$`, 'gm');
const OUT = new RegExp(String.raw`^([ \t]*)!\[(\d+(?:\.\d+)?)\]\(${DEST}(?:\s+"((?:[^"\\]|\\.)*)")?\)[ \t]*$`, 'gm');
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const unesc = (s) => s.replace(/\\(.)/g, '$1');

export function toEditor(md) {
  return md.replace(IN, (all, indent, alt, dest, title = '') => {
    const w = /^w=(\d+(?:\.\d+)?)$/.exec(title);
    const caption = w || !title ? alt : unesc(title);
    return `${indent}![${w ? w[1] : 1}](${dest}${caption ? ` "${esc(caption)}"` : ''})`;
  });
}

export function fromEditor(md) {
  return md.replace(OUT, (all, indent, ratio, dest, title = '') => {
    const r = Number(ratio);
    const size = r && Math.abs(r - 1) > 0.005 ? ` "w=${r.toFixed(2)}"` : '';
    return `${indent}![${unesc(title)}](${dest}${size})`;
  });
}
