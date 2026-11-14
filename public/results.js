export function safeLink(value){
  try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
export function appendLinkedText(parent,text){
  const pattern=/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>]+)/g;
  let index=0;
  for(const match of text.matchAll(pattern)){
    parent.append(document.createTextNode(text.slice(index,match.index)));
    const raw=match[2]||match[3],url=safeLink(raw);
    if(url){const link=document.createElement('a');link.href=url;link.textContent=match[1]||raw;link.target='_blank';link.rel='noopener noreferrer';parent.append(link);}
    else parent.append(document.createTextNode(match[0]));
    index=match.index+match[0].length;
  }
  parent.append(document.createTextNode(text.slice(index)));
}
export function appendImages(parent,images){
  const gallery=document.createElement('div');gallery.className='image-gallery';
  for(const result of images.slice(0,6)){
    const source=safeLink(result.source),thumbnail=safeLink(result.thumbnail);
    if(!source||!thumbnail)continue;
    const thumbUrl=new URL(thumbnail),sourceUrl=new URL(source);
    if(thumbUrl.protocol!=='https:'||!['upload.wikimedia.org','thumb.wikimedia.org'].includes(thumbUrl.hostname)||sourceUrl.hostname!=='commons.wikimedia.org')continue;
    const card=document.createElement('article');card.className='image-result';
    const preview=document.createElement('a');preview.href=source;preview.target='_blank';preview.rel='noopener noreferrer';
    const image=document.createElement('img');image.src=thumbnail;image.alt=result.title||'Image result';image.loading='lazy';image.referrerPolicy='no-referrer';
    image.onerror=()=>{image.hidden=true;const note=document.createElement('span');note.className='image-unavailable';note.textContent='Preview unavailable · open source ↗';preview.append(note);};preview.append(image);
    const caption=document.createElement('div');caption.className='image-caption';
    const title=document.createElement('a');title.href=source;title.target='_blank';title.rel='noopener noreferrer';title.textContent=result.title||'View image';
    const credit=document.createElement('small');credit.textContent=[result.artist,result.license].filter(Boolean).join(' · ')||'Wikimedia Commons';
    caption.append(title,credit);card.append(preview,caption);gallery.append(card);
  }
  parent.append(gallery);
}

// ---------- Rich text for replies ----------
// A small, safe markdown subset built with DOM nodes (never innerHTML):
// paragraphs, headings, lists, code, bold, italics, links and images.
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|bmp)(?:$|[?#])/i;
// Local images saved in its files folder (any localhost port) become same-origin paths.
export function localImagePath(raw) {
  try {
    const url = new URL(raw, location.origin);
    const local = url.origin === location.origin || ['localhost', '127.0.0.1'].includes(url.hostname);
    if (!local || !url.pathname.startsWith('/files/') || !IMAGE_FILE.test(url.pathname)) return null;
    return url.pathname;
  } catch { return null; }
}
function imageFigure(src, alt, onImage) {
  const fig = document.createElement('figure'); fig.className = 'reply-image';
  const button = document.createElement('button'); button.type = 'button';
  button.setAttribute('aria-label', 'Open image: ' + (alt || 'generated image'));
  const img = document.createElement('img'); img.src = src; img.alt = alt || 'Generated image'; img.loading = 'lazy';
  img.onerror = () => { fig.classList.add('broken'); img.remove(); button.textContent = 'This image could not be loaded.'; };
  button.append(img); button.onclick = () => onImage?.({url: src, name: alt || src.split('/').pop()});
  fig.append(button);
  if (alt) { const cap = document.createElement('figcaption'); cap.textContent = alt; fig.append(cap); }
  return fig;
}
function inline(parent, text, ctx) {
  const pattern = /!\[([^\]]*)\]\(([^)\s]+)\)|\[([^\]\n]+)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|\*\*([^*]+)\*\*|`([^`\n]+)`|(?<![\w*])\*([^*\n]+)\*(?![\w*])/g;
  let index = 0;
  for (const m of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(index, m.index)));
    index = m.index + m[0].length;
    if (m[2] !== undefined) {
      const local = localImagePath(m[2]);
      if (local) { ctx.images.push({src: local, alt: m[1]}); ctx.seen.add(local); continue; }
      const url = safeLink(m[2]);
      if (url) { const a = document.createElement('a'); a.href = url; a.textContent = m[1] || url; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.append(a); }
      else parent.append(document.createTextNode(m[1] || ''));
    } else if (m[4] !== undefined || m[5] !== undefined) {
      const raw = m[4] ?? m[5], local = localImagePath(raw);
      if (local && !ctx.seen.has(local)) { ctx.images.push({src: local, alt: m[3] || ''}); ctx.seen.add(local); }
      const href = local || safeLink(raw);
      if (href) { const a = document.createElement('a'); a.href = href; a.textContent = m[3] || raw; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.append(a); }
      else parent.append(document.createTextNode(m[0]));
    } else if (m[6] !== undefined) { const b = document.createElement('strong'); b.textContent = m[6]; parent.append(b); }
    else if (m[7] !== undefined) { const c = document.createElement('code'); c.textContent = m[7]; parent.append(c); }
    else if (m[8] !== undefined) { const i = document.createElement('em'); i.textContent = m[8]; parent.append(i); }
  }
  parent.append(document.createTextNode(text.slice(index)));
}
export function renderRich(parent, text, {onImage, hideBoards = false, seen = new Set()} = {}) {
  const ctx = {images: [], seen};
  let flushed = 0;
  // Images are placed right where the reply mentions them.
  const flush = () => {
    if (ctx.images.length <= flushed) return;
    const gallery = document.createElement('div'); gallery.className = 'reply-images';
    for (const image of ctx.images.slice(flushed)) gallery.append(imageFigure(image.src, image.alt, onImage));
    flushed = ctx.images.length; parent.append(gallery);
  };
  const parts = String(text).split(/(```[^\n]*\n[\s\S]*?(?:```|$))/g);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('```')) {
      const lang = (/^```\s*([\w-]*)/.exec(part)?.[1] || '').toLowerCase();
      const body = part.replace(/^```[^\n]*\n/, '').replace(/```$/, '').trim();
      const pre = document.createElement('pre'), code = document.createElement('code');
      code.textContent = part.replace(/^```[^\n]*\n/, '').replace(/```$/, '');
      pre.append(code); parent.append(pre); continue;
    }
    // Each line is a heading, a bullet, a numbered item or prose; runs of the same kind are grouped.
    let list = null, para = null;
    const close = () => { if (para && para.textContent.trim()) parent.append(para); para = null; list = null; };
    for (const line of part.split('\n')) {
      if (!line.trim()) { close(); flush(); continue; }
      const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line);
      const bullet = /^(\s*)[-*•]\s+(.*)$/.exec(line), numbered = /^(\s*)\d+[.)]\s+(.*)$/.exec(line);
      if (heading) { close(); const h = document.createElement(heading[1].length <= 2 ? 'h3' : 'h4'); inline(h, heading[2], ctx); parent.append(h); continue; }
      if (bullet || numbered) {
        const tag = bullet ? 'UL' : 'OL', m = bullet || numbered;
        if (para) { if (para.textContent.trim()) parent.append(para); para = null; }
        if (!list || list.tagName !== tag) { list = document.createElement(tag); parent.append(list); }
        const li = document.createElement('li'); if (m[1].length >= 2) li.className = 'sub'; inline(li, m[2], ctx); list.append(li); continue;
      }
      list = null;
      if (!para) para = document.createElement('p'); else para.append(document.createElement('br'));
      inline(para, line, ctx);
    }
    close();
  }
  flush();
  return ctx.seen;
}
export function generatedGallery(images, {onImage, seen = new Set()} = {}) {
  const fresh = images.filter(i => i?.url && !seen.has(i.url));
  if (!fresh.length) return null;
  const gallery = document.createElement('div'); gallery.className = 'reply-images';
  for (const image of fresh) {
    const fig = imageFigure(image.url, image.name, onImage);
    const actions = document.createElement('div'); actions.className = 'image-actions';
    const open = document.createElement('a'); open.href = image.url; open.target = '_blank'; open.rel = 'noopener'; open.textContent = 'Open full size';
    const save = document.createElement('a'); save.href = image.url + '?download=1'; save.textContent = 'Download';
    actions.append(open, save); fig.append(actions); gallery.append(fig);
  }
  return gallery;
}
