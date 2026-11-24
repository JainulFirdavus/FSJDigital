// Single-admin login: password from ADMIN_PASSWORD, stateless signed session cookie.
import { createHash, createHmac, timingSafeEqual, randomBytes } from 'node:crypto';

const COOKIE = 'sc_admin';
const MAX_AGE = 7 * 24 * 3600; // seconds
const prod = process.env.NODE_ENV === 'production';

const adminPassword = () => process.env.ADMIN_PASSWORD || (prod ? '' : 'admin');
const secret = () => process.env.SESSION_SECRET || createHash('sha256').update(`session:${adminPassword()}`).digest('hex');
const sign = (v) => createHmac('sha256', secret()).update(v).digest('hex');
const sha = (v) => createHash('sha256').update(String(v)).digest();

export function checkPassword(input) {
  const expected = adminPassword();
  if (!expected) return false; // production without ADMIN_PASSWORD: admin disabled
  return timingSafeEqual(sha(input), sha(expected));
}

export function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${exp}.${randomBytes(8).toString('hex')}`;
  return `${COOKIE}=${payload}.${sign(payload)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax${prod ? '; Secure' : ''}`;
}

export const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${prod ? '; Secure' : ''}`;

export function isAdmin(req) {
  const raw = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (!raw) return false;
  const i = raw.lastIndexOf('.');
  const payload = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (!/^[a-f0-9]{64}$/.test(sig)) return false;
  if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(sign(payload), 'hex'))) return false;
  return Number(payload.split('.')[0]) > Date.now() / 1000;
}

export const adminConfigured = () => Boolean(adminPassword());
