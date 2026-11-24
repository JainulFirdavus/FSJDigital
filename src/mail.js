// Email through Resend's HTTPS API (works on Render's free plan, which blocks SMTP ports).
// Without RESEND_API_KEY, emails are logged to the console instead of sent.
import { esc } from './util.js';

export const mailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);

export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!mailConfigured()) {
    console.log(`[mail] not configured — would send to ${to}: ${subject}`);
    return 'not_configured';
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return 'sent';
    const body = await res.text();
    console.error('[mail] Resend error', res.status, body.slice(0, 300));
    return `failed (${res.status})`;
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    return 'failed';
  }
}

const paragraphs = (s) => esc(s).replace(/\r?\n/g, '<br>');

function shell(site, inner) {
  return `<!doctype html><html><body style="margin:0;background:#f4f5f8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1b1f2a">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;border:1px solid #e6e8ef">
<tr><td style="padding:22px 26px;border-bottom:1px solid #eef0f4;font-weight:700;font-size:16px">${esc(site.siteName)}</td></tr>
<tr><td style="padding:24px 26px;font-size:15px;line-height:1.6">${inner}</td></tr>
<tr><td style="padding:16px 26px;border-top:1px solid #eef0f4;font-size:12px;color:#6b7283">${esc(site.siteName)}${site.phone ? ' · ' + esc(site.phone) : ''}</td></tr>
</table></td></tr></table></body></html>`;
}

const quote = (label, body) =>
  `<div style="margin-top:22px;padding:12px 14px;border-left:3px solid #d6d9e2;background:#f8f9fb;color:#4a5163;font-size:14px"><div style="font-size:12px;color:#7a8194;margin-bottom:6px">${esc(label)}</div>${paragraphs(body)}</div>`;

export function ackEmail(site, inquiry) {
  const subject = `We received your message — ${site.siteName}`;
  const html = shell(site, `<p>Hi ${esc(inquiry.name)},</p><p>${paragraphs(site.ackMessage)}</p>${quote('Your message' + (inquiry.product ? ` about ${inquiry.product}` : ''), inquiry.message)}`);
  const text = `Hi ${inquiry.name},\n\n${site.ackMessage}\n\n— Your message —\n${inquiry.message}`;
  return { subject, html, text };
}

export function adminNoticeEmail(site, inquiry, adminUrl) {
  const subject = `New ${inquiry.source === 'chat' ? 'chat lead' : 'inquiry'}: ${inquiry.name}${inquiry.product ? ` · ${inquiry.product}` : ''}`;
  const rows = [['Name', inquiry.name], ['Email', inquiry.email], ['Phone', inquiry.phone], ['Company', inquiry.company], ['Product', inquiry.product], ['Source', inquiry.source]]
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:3px 12px 3px 0;color:#7a8194">${k}</td><td>${esc(v)}</td></tr>`).join('');
  const html = shell(site, `<p style="margin-top:0"><b>New inquiry</b></p><table style="font-size:14px">${rows}</table>${quote('Message', inquiry.message)}
    <p style="margin-top:22px"><a href="${esc(adminUrl)}" style="background:#3b5bdb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Reply in admin</a></p>`);
  const text = `New inquiry from ${inquiry.name} <${inquiry.email}>\n\n${inquiry.message}\n\nReply: ${adminUrl}`;
  return { subject, html, text };
}

export function replyEmail(site, inquiry, body) {
  const subject = `Re: your inquiry${inquiry.product ? ` about ${inquiry.product}` : ''} — ${site.siteName}`;
  const html = shell(site, `<p>Hi ${esc(inquiry.name)},</p><p>${paragraphs(body)}</p>${quote('Your original message', inquiry.message)}`);
  const text = `Hi ${inquiry.name},\n\n${body}\n\n— Your original message —\n${inquiry.message}`;
  return { subject, html, text };
}
