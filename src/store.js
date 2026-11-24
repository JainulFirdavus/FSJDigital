// Content + inquiry data access, with a small in-memory cache for public pages
// (so the database is only hit when something changes).
import { randomUUID } from 'node:crypto';
import { all, get, run } from './db.js';
import { DEFAULT_SETTINGS, SEED_PRODUCTS } from './seed.js';

const now = () => new Date().toISOString();
let cache = { products: null, settings: null };
export const invalidate = () => { cache = { products: null, settings: null }; };

export async function seedIfEmpty() {
  const row = await get('SELECT COUNT(*) AS n FROM products');
  if (Number(row?.n) > 0) return false;
  let i = 0;
  for (const p of SEED_PRODUCTS) await saveProduct({ ...p, sortOrder: i++, published: true });
  return true;
}

// ---------- settings ----------
export async function getSettings() {
  if (cache.settings) return cache.settings;
  const row = await get('SELECT value FROM settings WHERE key = ?', ['site']);
  cache.settings = { ...DEFAULT_SETTINGS, ...(row ? JSON.parse(row.value) : {}) };
  return cache.settings;
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
    ['site', JSON.stringify(next)],
  );
  invalidate();
  return next;
}

// ---------- products ----------
const fromRow = (r) => ({ ...JSON.parse(r.data), id: r.id, slug: r.slug, sortOrder: Number(r.sort_order), published: !!Number(r.published), updatedAt: r.updated_at });

export async function listProducts({ includeHidden = false } = {}) {
  if (!cache.products) {
    const rows = await all('SELECT * FROM products ORDER BY sort_order, slug');
    cache.products = rows.map(fromRow);
  }
  return includeHidden ? cache.products : cache.products.filter((p) => p.published);
}

export async function getProduct(slug, opts) {
  return (await listProducts(opts)).find((p) => p.slug === slug);
}

export function normalizeProduct(input) {
  const s = (v, max = 400) => String(v ?? '').trim().slice(0, max);
  const arr = (v) => (Array.isArray(v) ? v : []);
  const slug = s(input.slug || input.name, 60).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw Object.assign(new Error('Name or slug is required.'), { status: 400 });
  const demo = input.demo || {};
  return {
    id: input.id || randomUUID(),
    slug,
    sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 0,
    published: input.published !== false,
    data: {
      name: s(input.name, 80) || slug,
      category: ['web', 'mobile', 'device'].includes(input.category) ? input.category : 'web',
      platform: s(input.platform, 80),
      icon: s(input.icon, 8),
      color: /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : '#3b5bdb',
      tagline: s(input.tagline, 160),
      summary: s(input.summary, 400),
      description: s(input.description, 6000),
      features: arr(input.features).map((x) => ({ title: s(x.title, 80), text: s(x.text, 240) })).filter((x) => x.title).slice(0, 24),
      tech: arr(input.tech).map((x) => s(x, 40)).filter(Boolean).slice(0, 16),
      price: s(input.price, 40),
      priceNote: s(input.priceNote, 80),
      demo: {
        type: demo.type === 'live' ? 'live' : 'gallery',
        url: /^https?:\/\//i.test(demo.url || '') ? s(demo.url, 500) : '',
        device: demo.device === 'phone' ? 'phone' : 'desktop',
        note: s(demo.note, 300),
      },
      videoUrl: /^https?:\/\//i.test(input.videoUrl || '') ? s(input.videoUrl, 500) : '',
      gallery: arr(input.gallery)
        .map((g) => ({ src: s(g.src, 500), caption: s(g.caption, 120), frame: ['phone', 'round'].includes(g.frame) ? g.frame : 'desktop' }))
        .filter((g) => /^(\/static\/|\/media\/|https?:\/\/)/.test(g.src))
        .slice(0, 30),
      keywords: arr(input.keywords).map((x) => s(x, 40).toLowerCase()).filter(Boolean).slice(0, 30),
      metaTitle: s(input.metaTitle, 120),
      metaDescription: s(input.metaDescription, 300),
    },
  };
}

export async function saveProduct(input) {
  const p = normalizeProduct(input);
  const clash = await get('SELECT id FROM products WHERE slug = ? AND id <> ?', [p.slug, p.id]);
  if (clash) throw Object.assign(new Error(`The link “${p.slug}” is already used by another product.`), { status: 409 });
  await run(
    `INSERT INTO products (id, slug, data, sort_order, published, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, data = excluded.data, sort_order = excluded.sort_order,
       published = excluded.published, updated_at = excluded.updated_at`,
    [p.id, p.slug, JSON.stringify(p.data), p.sortOrder, p.published ? 1 : 0, now()],
  );
  invalidate();
  return (await listProducts({ includeHidden: true })).find((x) => x.id === p.id);
}

export async function deleteProduct(id) {
  await run('DELETE FROM products WHERE id = ?', [id]);
  invalidate();
}

// ---------- media (uploaded images live in the database so they survive redeploys) ----------
export async function saveMedia({ mime, base64 }) {
  const id = randomUUID().replace(/-/g, '');
  const size = Math.floor((base64.length * 3) / 4);
  await run('INSERT INTO media (id, mime, data, size, created_at) VALUES (?, ?, ?, ?, ?)', [id, mime, base64, size, now()]);
  return { id, url: `/media/${id}`, size };
}
export const getMedia = (id) => get('SELECT mime, data FROM media WHERE id = ?', [id]);

// ---------- inquiries ----------
export async function createInquiry({ name, email, phone, company, product, message, source }) {
  const id = randomUUID();
  const t = now();
  await run(
    `INSERT INTO inquiries (id, name, email, phone, company, product, message, source, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
    [id, name, email, phone || null, company || null, product || null, message, source, t, t],
  );
  await addMessage(id, 'in', message, null);
  return { id, name, email, phone, company, product, message, source, status: 'new', created_at: t };
}

export async function addMessage(inquiryId, direction, body, emailStatus) {
  const t = now();
  await run('INSERT INTO messages (id, inquiry_id, direction, body, email_status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [randomUUID(), inquiryId, direction, body, emailStatus, t]);
  return t;
}

export async function listInquiries({ status } = {}) {
  const where = status && status !== 'all' ? 'WHERE status = ?' : '';
  return all(`SELECT id, name, email, phone, company, product, source, status, created_at, updated_at,
                substr(message, 1, 160) AS preview FROM inquiries ${where} ORDER BY created_at DESC LIMIT 500`,
  status && status !== 'all' ? [status] : []);
}

export async function getInquiry(id) {
  const inquiry = await get('SELECT * FROM inquiries WHERE id = ?', [id]);
  if (!inquiry) return null;
  inquiry.messages = await all('SELECT * FROM messages WHERE inquiry_id = ? ORDER BY created_at', [id]);
  return inquiry;
}

export async function setInquiryStatus(id, status) {
  await run('UPDATE inquiries SET status = ?, updated_at = ? WHERE id = ?', [status, now(), id]);
}

export async function deleteInquiry(id) {
  await run('DELETE FROM messages WHERE inquiry_id = ?', [id]);
  await run('DELETE FROM inquiries WHERE id = ?', [id]);
}

export async function inquiryCounts() {
  const rows = await all('SELECT status, COUNT(*) AS n FROM inquiries GROUP BY status');
  return Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
}
