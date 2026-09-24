const cheerio = require('cheerio');

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'main', 'figure', 'figcaption',
  'ul', 'ol', 'table', 'thead', 'tbody', 'tr', 'blockquote', 'details', 'summary', 'form',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'dl', 'dt', 'dd', 'label', 'select', 'button', 'nav',
]);

function collapse(text) {
  return text.replace(/[ \t\r\n ]+/g, ' ');
}

// Converts an HTML fragment to readable plain text that keeps the structure a
// reader needs: headings stay on their own lines, list items become "- item",
// table cells are separated by " | ", and image alt text is kept as
// "[image: alt]" since some pages only name a product/technique in a picture.
function htmlToText(html) {
  if (!html) return '';
  const $ = cheerio.load(`<div id="__root">${html}</div>`, null, false);
  $('script, style, noscript, svg, template, iframe').remove();

  const out = [];
  let line = '';
  const flush = () => {
    const t = line.trim();
    if (t) out.push(t);
    line = '';
  };

  const walk = (node) => {
    if (node.type === 'text') {
      line += collapse(node.data);
      return;
    }
    if (node.type !== 'tag') return;
    const tag = node.name;

    if (tag === 'br') { flush(); return; }
    if (tag === 'img') {
      const alt = (node.attribs.alt || '').trim();
      if (alt) { flush(); out.push(`[image: ${alt}]`); }
      return;
    }
    if (tag === 'option') {
      const t = collapse($(node).text()).trim();
      if (t) line += `${line.trim() ? ', ' : ''}${t}`;
      return;
    }
    if (tag === 'li') {
      flush();
      line = '- ';
      node.children.forEach(walk);
      flush();
      return;
    }
    if (tag === 'td' || tag === 'th') {
      if (line.trim()) line += ' | ';
      node.children.forEach(walk);
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      flush();
      node.children.forEach(walk);
      const t = line.trim();
      line = '';
      if (t) out.push(`${'#'.repeat(Number(tag[1]))} ${t}`);
      return;
    }

    const block = BLOCK_TAGS.has(tag);
    if (block) flush();
    node.children.forEach(walk);
    if (block) flush();
  };

  $('#__root')[0].children.forEach(walk);
  flush();

  // A <li> wrapping a block (<li><p>text</p></li>) leaves the bullet on its
  // own line — join it back onto the text that follows.
  const merged = [];
  for (let i = 0; i < out.length; i++) {
    if (out[i] === '-' && out[i + 1]) merged.push(`- ${out[++i]}`);
    else merged.push(out[i]);
  }

  // Drop immediately repeated lines (sliders/carousels render every slide twice).
  return merged.filter((l, i) => l !== merged[i - 1]).join('\n');
}

module.exports = { htmlToText };
