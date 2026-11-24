const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const isEmail = (v) => typeof v === 'string' && v.length <= 200 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(v);

// Fixed-window rate limiter kept in memory (fine for a single small instance).
export function rateLimiter({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (v.reset < t) hits.delete(k); }, windowMs).unref();
  return (key) => {
    const t = Date.now();
    const e = hits.get(key);
    if (!e || e.reset < t) { hits.set(key, { n: 1, reset: t + windowMs }); return true; }
    e.n += 1;
    return e.n <= max;
  };
}

// Turn a YouTube / Vimeo / direct video link into something embeddable.
export function videoEmbed(url) {
  if (!url) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.replace(/^www\.|^m\./, '');
  let id;
  if (host === 'youtu.be') id = u.pathname.slice(1);
  else if (host.endsWith('youtube.com')) id = u.searchParams.get('v') || u.pathname.match(/\/(?:embed|shorts|live)\/([^/?]+)/)?.[1];
  if (id && /^[\w-]{6,20}$/.test(id)) return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, vertical: u.pathname.startsWith('/shorts') };
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const vid = u.pathname.match(/(\d{6,})/)?.[1];
    if (vid) return { kind: 'iframe', src: `https://player.vimeo.com/video/${vid}` };
  }
  if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return { kind: 'video', src: u.href };
  if (host === 'drive.google.com') {
    const fid = u.pathname.match(/\/d\/([\w-]+)/)?.[1];
    if (fid) return { kind: 'iframe', src: `https://drive.google.com/file/d/${fid}/preview` };
  }
  return null;
}

export const categoryLabel = { web: 'Web app', mobile: 'Mobile app', device: 'Smart device' };
