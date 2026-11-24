// FSJ Digital — product sales site + CMS. One Node process, one dependency (pg, only in production).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { initDb } from './src/db.js';
import * as store from './src/store.js';
import { homePage, productPage, demoPage, notFoundPage } from './src/views.js';
import { chatReply, applyChatSettings } from './src/chat.js';
import { sendMail, ackEmail, adminNoticeEmail, replyEmail, mailConfigured } from './src/mail.js';
import { checkPassword, sessionCookie, clearCookie, isAdmin, adminConfigured } from './src/auth.js';
import { isEmail, rateLimiter } from './src/util.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 3000;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const limitForm = rateLimiter({ windowMs: 10 * 60_000, max: 5 });
const limitChat = rateLimiter({ windowMs: 60_000, max: 30 });
const limitLogin = rateLimiter({ windowMs: 15 * 60_000, max: 10 });

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

// ---------- helpers ----------
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
const baseUrl = (req) => (process.env.PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`).replace(/\/$/, '');

function send(req, res, status, body, type, extra = {}) {
  const headers = { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', ...extra };
  let buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
  if (buf.length > 1024 && /text|json|javascript|svg/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    buf = zlib.gzipSync(buf, { level: 6 });
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }
  headers['Content-Length'] = buf.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : buf);
}
const json = (req, res, status, data, extra) => send(req, res, status, JSON.stringify(data), 'application/json; charset=utf-8', { 'Cache-Control': 'no-store', ...extra });
const html = (req, res, status, body) => send(req, res, status, body, 'text/html; charset=utf-8', { 'Cache-Control': 'public, max-age=60' });

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    if (!/application\/json/.test(req.headers['content-type'] || '')) return reject(new HttpError(415, 'Send JSON.'));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new HttpError(413, 'Request is too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new HttpError(400, 'Invalid JSON.')); } });
    req.on('error', reject);
  });
}

function serveStatic(req, res, rel) {
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return false;
  let stat;
  try { stat = fs.statSync(file); } catch { return false; }
  if (!stat.isFile()) return false;
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const versioned = /[?&]v=/.test(req.url);
  const cache = versioned ? 'public, max-age=31536000, immutable' : type.startsWith('image/') ? 'public, max-age=604800' : 'public, max-age=300';
  send(req, res, 200, fs.readFileSync(file), type, { 'Cache-Control': cache });
  return true;
}

function requireAdmin(req) {
  if (!isAdmin(req)) throw new HttpError(401, 'Please sign in.');
  // CSRF guard for state-changing requests: browsers always send Origin on cross-site POST/PUT/DELETE.
  if (req.method !== 'GET' && req.headers.origin) {
    let host = '';
    try { host = new URL(req.headers.origin).host; } catch { /* "null" or malformed origin */ }
    if (host !== req.headers.host) throw new HttpError(403, 'Bad origin.');
  }
}

const str = (v, max) => String(v ?? '').trim().slice(0, max);

// ---------- inquiries (public) ----------
async function handleInquiry(req, res) {
  if (!limitForm(clientIp(req))) throw new HttpError(429, 'Too many messages. Please try again in a few minutes.');
  const b = await readJson(req, 32_000);
  if (b.website) return json(req, res, 200, { ok: true }); // honeypot: silently drop bots
  const inquiry = {
    name: str(b.name, 100), email: str(b.email, 200).toLowerCase(), phone: str(b.phone, 40), company: str(b.company, 100),
    product: str(b.product, 80), message: str(b.message, 4000), source: b.source === 'chat' ? 'chat' : 'form',
  };
  if (!inquiry.name) throw new HttpError(400, 'Please enter your name.');
  if (!isEmail(inquiry.email)) throw new HttpError(400, 'Please enter a valid email address.');
  if (inquiry.message.length < 2) throw new HttpError(400, 'Please write a short message.');
  const saved = await store.createInquiry(inquiry);
  json(req, res, 201, { ok: true });

  // Emails go out after responding, so the visitor never waits on the mail provider.
  const site = await store.getSettings();
  const ack = ackEmail(site, saved);
  const adminTo = site.notificationEmail || process.env.ADMIN_EMAIL || site.contactEmail;
  const from = site.mailFrom || process.env.MAIL_FROM;
  await sendMail({ to: saved.email, ...ack, replyTo: adminTo || undefined, from });
  if (adminTo) await sendMail({ to: adminTo, ...adminNoticeEmail(site, saved, `${baseUrl(req)}/admin#inquiry/${saved.id}`), replyTo: saved.email, from });
}

// ---------- admin API ----------
async function handleAdmin(req, res, url) {
  const p = url.pathname.replace(/^\/api\/admin/, '');
  const m = req.method;

  if (p === '/login' && m === 'POST') {
    if (!limitLogin(clientIp(req))) throw new HttpError(429, 'Too many attempts. Try again later.');
    if (!adminConfigured()) throw new HttpError(503, 'Set ADMIN_PASSWORD on the server to enable the admin.');
    const b = await readJson(req, 2_000);
    if (!checkPassword(String(b.password || ''))) throw new HttpError(401, 'Wrong password.');
    return json(req, res, 200, { ok: true }, { 'Set-Cookie': sessionCookie() });
  }
  if (p === '/logout' && m === 'POST') return json(req, res, 200, { ok: true }, { 'Set-Cookie': clearCookie() });
  if (p === '/session' && m === 'GET') {
    const site = await store.getSettings();
    return json(req, res, 200, { authenticated: isAdmin(req), mail: mailConfigured(site.mailFrom || process.env.MAIL_FROM) });
  }

  requireAdmin(req);

  if (p === '/overview' && m === 'GET') {
    const site = await store.getSettings();
    return json(req, res, 200, { counts: await store.inquiryCounts(), mail: mailConfigured(site.mailFrom || process.env.MAIL_FROM) });
  }

  // products
  if (p === '/products' && m === 'GET') return json(req, res, 200, await store.listProducts({ includeHidden: true }));
  if (p === '/products' && m === 'POST') return json(req, res, 201, await store.saveProduct(await readJson(req, 200_000)));
  let r = p.match(/^\/products\/([\w-]+)$/);
  if (r && m === 'PUT') return json(req, res, 200, await store.saveProduct({ ...(await readJson(req, 200_000)), id: r[1] }));
  if (r && m === 'DELETE') { await store.deleteProduct(r[1]); return json(req, res, 200, { ok: true }); }

  // media upload: { mime, data(base64) } — images are resized in the browser first
  if (p === '/media' && m === 'POST') {
    const b = await readJson(req, 6_000_000);
    if (!IMAGE_TYPES.has(b.mime)) throw new HttpError(400, 'Upload a JPG, PNG, WebP or GIF image.');
    const base64 = String(b.data || '').replace(/^data:[^,]+,/, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(base64)) throw new HttpError(400, 'Invalid image data.');
    if (base64.length > 4_000_000) throw new HttpError(413, 'Image is too large (max ~3 MB).');
    return json(req, res, 201, await store.saveMedia({ mime: b.mime, base64 }));
  }

  // settings
  if (p === '/settings' && m === 'GET') {
    const site = await store.getSettings();
    const mailFrom = site.mailFrom || process.env.MAIL_FROM || '';
    return json(req, res, 200, {
      ...site,
      mailFrom,
      notificationEmail: site.notificationEmail || process.env.ADMIN_EMAIL || '',
      mailConfigured: mailConfigured(mailFrom),
      mailApiKeyConfigured: Boolean(process.env.RESEND_API_KEY),
    });
  }
  if (p === '/settings' && m === 'PUT') {
    const b = await readJson(req, 50_000);
    const keys = ['siteName', 'tagline', 'heroTitle', 'heroSubtitle', 'contactEmail', 'mailFrom', 'notificationEmail', 'phone', 'whatsapp', 'address', 'ackMessage', 'chatGreeting', 'chatFallback', 'footerNote'];
    const patch = Object.fromEntries(keys.filter((k) => k in b).map((k) => [k, str(b[k], k === 'mailFrom' ? 250 : 1000)]));
    if (patch.siteName === '') delete patch.siteName;
    if (patch.notificationEmail && !isEmail(patch.notificationEmail)) throw new HttpError(400, 'Please enter a valid notification email address.');
    if (patch.mailFrom) {
      const fromAddress = patch.mailFrom.match(/<([^<>]+)>$/)?.[1] || patch.mailFrom;
      if (!isEmail(fromAddress)) throw new HttpError(400, 'Enter a valid sender email, optionally formatted as Name <email>.');
    }
    for (const key of ['chatEnabled', 'chatCollectLeads']) {
      if (key in b) {
        if (typeof b[key] !== 'boolean') throw new HttpError(400, `The ${key} setting must be true or false.`);
        patch[key] = b[key];
      }
    }
    if (Array.isArray(b.faq)) patch.faq = b.faq.map((x) => ({ q: str(x.q, 200), a: str(x.a, 1000) })).filter((x) => x.q && x.a).slice(0, 30);
    return json(req, res, 200, await store.saveSettings(patch));
  }

  // inquiries
  if (p === '/inquiries' && m === 'GET') return json(req, res, 200, await store.listInquiries({ status: url.searchParams.get('status') }));
  r = p.match(/^\/inquiries\/([\w-]+)$/);
  if (r && m === 'GET') {
    const inq = await store.getInquiry(r[1]);
    if (!inq) throw new HttpError(404, 'Inquiry not found.');
    return json(req, res, 200, inq);
  }
  if (r && m === 'PATCH') {
    const b = await readJson(req, 2_000);
    if (!['new', 'replied', 'closed'].includes(b.status)) throw new HttpError(400, 'Unknown status.');
    await store.setInquiryStatus(r[1], b.status);
    return json(req, res, 200, { ok: true });
  }
  if (r && m === 'DELETE') { await store.deleteInquiry(r[1]); return json(req, res, 200, { ok: true }); }
  r = p.match(/^\/inquiries\/([\w-]+)\/reply$/);
  if (r && m === 'POST') {
    const b = await readJson(req, 40_000);
    const body = str(b.body, 10_000);
    if (!body) throw new HttpError(400, 'Write a reply first.');
    const inq = await store.getInquiry(r[1]);
    if (!inq) throw new HttpError(404, 'Inquiry not found.');
    let emailStatus = 'note';
    if (b.sendEmail !== false) {
      const site = await store.getSettings();
      emailStatus = await sendMail({
        to: inq.email,
        ...replyEmail(site, inq, body),
        replyTo: site.notificationEmail || process.env.ADMIN_EMAIL || site.contactEmail || undefined,
        from: site.mailFrom || process.env.MAIL_FROM,
      });
    }
    await store.addMessage(inq.id, 'out', body, emailStatus);
    if (b.sendEmail !== false) await store.setInquiryStatus(inq.id, 'replied');
    return json(req, res, 200, { ok: true, emailStatus, inquiry: await store.getInquiry(inq.id) });
  }

  throw new HttpError(404, 'Not found.');
}

// ---------- router ----------
async function route(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const m = req.method;

  if (p === '/healthz') return send(req, res, 200, 'ok', 'text/plain');
  if (p.startsWith('/api/admin/')) return handleAdmin(req, res, url);
  if (p === '/api/inquiries' && m === 'POST') return handleInquiry(req, res);
  if (p === '/api/chat' && m === 'POST') {
    if (!limitChat(clientIp(req))) throw new HttpError(429, 'Slow down a little 🙂');
    const b = await readJson(req, 4_000);
    const [products, site] = await Promise.all([store.listProducts(), store.getSettings()]);
    if (site.chatEnabled === false) throw new HttpError(404, 'Chat is currently unavailable.');
    return json(req, res, 200, applyChatSettings(chatReply(str(b.message, 500), products, site), site));
  }
  if (p.startsWith('/api/')) throw new HttpError(404, 'Not found.');

  if (m !== 'GET' && m !== 'HEAD') throw new HttpError(405, 'Method not allowed.');

  if (p.startsWith('/static/') && serveStatic(req, res, p.slice('/static'.length))) return;
  if (p === '/favicon.ico' && serveStatic(req, res, '/favicon.svg')) return;
  let r = p.match(/^\/media\/([a-f0-9]{32})$/);
  if (r) {
    const media = await store.getMedia(r[1]);
    if (!media) throw new HttpError(404, 'Not found.');
    return send(req, res, 200, Buffer.from(media.data, 'base64'), media.mime, { 'Cache-Control': 'public, max-age=31536000, immutable' });
  }
  if (p === '/admin' || p === '/admin/') {
    return send(req, res, 200, fs.readFileSync(path.join(PUBLIC, 'admin/index.html')), MIME['.html'], {
      'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex',
    });
  }

  const [site, products] = await Promise.all([store.getSettings(), store.listProducts()]);
  const base = baseUrl(req);
  if (p === '/') return html(req, res, 200, homePage({ site, products, base }));
  r = p.match(/^\/(products|demo)\/([a-z0-9-]+)\/?$/);
  if (r) {
    const product = products.find((x) => x.slug === r[2]);
    if (product) return html(req, res, 200, (r[1] === 'demo' ? demoPage : productPage)({ site, products, product, base }));
  }
  if (p === '/robots.txt') return send(req, res, 200, `User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`, MIME['.txt']);
  if (p === '/sitemap.xml') {
    const urls = ['/', ...products.flatMap((x) => [`/products/${x.slug}`, `/demo/${x.slug}`])];
    return send(req, res, 200, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('')}</urlset>`, 'application/xml');
  }
  return send(req, res, 404, notFoundPage({ site, products, base }), MIME['.html']);
}

const server = http.createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(`[${req.method} ${req.url}]`, err);
    if (res.headersSent) return res.end();
    if ((req.url || '').startsWith('/api/')) return json(req, res, status, { error: status >= 500 ? 'Something went wrong. Please try again.' : err.message });
    send(req, res, status, status === 404 ? 'Not found' : 'Something went wrong', 'text/plain; charset=utf-8');
  }
});

const kind = await initDb();
const seeded = await store.seedIfEmpty();
const site = await store.getSettings();
server.listen(PORT, () => {
  console.log(`FSJ Digital running on http://localhost:${PORT}  (db: ${kind}${seeded ? ', seeded products' : ''}, mail: ${mailConfigured(site.mailFrom || process.env.MAIL_FROM) ? 'Resend' : 'console only'})`);
  if (!adminConfigured()) console.warn('ADMIN_PASSWORD is not set — the admin panel is disabled.');
  else if (!process.env.ADMIN_PASSWORD) console.warn('Admin password is "admin" for local development. Set ADMIN_PASSWORD before deploying.');
});
