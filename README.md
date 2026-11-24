# FSJ Digital — product sales site + CMS

A very light sales website for your products (KakiTask, MenuLister, Smart POS, Health Tracker,
PayTrack, Desk Buddy) with:

- **Landing page** with product cards, filters (Web / Mobile & devices), how it works, FAQ and contact form
- **Product pages** with features, screenshots, overview, SEO tags (Open Graph, JSON-LD, sitemap)
- **Demo page for every product** — live embedded app (MenuLister), screen tour (all), optional video
- **Chat assistant** that answers from your product data and turns chats into leads
- **Admin panel** at `/admin` — read inquiries, reply by email, edit products/images/videos/prices, site settings
- **Emails** — auto-reply to the customer, notification to you, and your replies from the admin

No front-end framework and no build step. One Node process, one dependency (`pg`, used only with Postgres).
Pages are rendered on the server (~5 KB gzipped HTML, 5 KB CSS, 3 KB JS).

## Run locally

```sh
cd FSJDigital
npm install
npm run dev            # http://localhost:3000   admin: http://localhost:3000/admin  (password: admin)
```

Locally the data is stored in `data/site.db` (Node's built-in SQLite) and emails are printed to the
console. Copy `.env.example` to `.env` to change settings.

## Deploy on Render

1. **Database** — create a free Postgres at [neon.tech](https://neon.tech) and copy the *pooled* connection string.
   (Render's free disk is wiped on every deploy, so SQLite would lose your inquiries.)
2. **Email** — create a [Resend](https://resend.com) account, verify your domain, create an API key.
   Render's free plan blocks SMTP ports, which is why the site sends mail over Resend's HTTPS API.
   Until your domain is verified, `onboarding@resend.dev` can only send to your own Resend account email.
3. Connect the GitHub repo (JainulFirdavus/FSJDigital), then Render → **New → Blueprint** → pick the repo (uses `render.yaml`).
4. Fill in the environment variables:

| Variable | Example | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://…neon.tech/neondb?sslmode=require` | Postgres (required on Render) |
| `ADMIN_PASSWORD` | a long password | Admin login (admin is disabled without it) |
| `PUBLIC_URL` | `https://fsj-digital.onrender.com` | Links in emails and SEO tags |
| `RESEND_API_KEY` | `re_…` | Sending email |
| `MAIL_FROM` | `FSJ Digital <hello@yourdomain.com>` | Sender address (verified domain) |
| `ADMIN_EMAIL` | `you@yourdomain.com` | Receives new-inquiry notifications; customer replies come here |

On first start the six products are added automatically. After that, change everything in `/admin`.

**Free plan note:** Render free services sleep after ~15 minutes without visits, so the first visit can take
30–60 s. For a sales site, the $7 *Starter* plan keeps it always on.

## Admin guide

- **Inquiries** — new form and chat leads. Open one, write a reply, and it is emailed to the customer
  (with your auto-reply text and their original message quoted). Untick “Email this reply” to save an internal note.
  When the customer answers the email, it arrives in your `ADMIN_EMAIL` inbox.
- **Products** — edit text, features (one per line: `Title — detail`), price (empty = “Get a quote”), chatbot
  keywords, SEO fields, publish/hide and order.
  - **Images**: upload screenshots (resized in the browser, stored in the database). The first image is the cover.
    Choose the frame: `desktop`, `phone` or `round` (watch faces).
  - **Demo**: *Screens tour* uses the images; *Live app* embeds a URL (used for MenuLister).
  - **Video**: paste a YouTube (unlisted works), Vimeo, Google Drive or direct `.mp4` link — it appears on the demo page.
    Upload videos to YouTube rather than to this site; it keeps the app light and plays better on phones.
- **Site settings** — business name, headline, contact details, WhatsApp, auto-reply email text, chat greeting, FAQ.

## Structure

```
server.js            routes, public API, admin API, static files, gzip
src/db.js            SQLite (local) / Postgres (production) adapter + schema
src/store.js         products, settings, media, inquiries (cached for fast pages)
src/views.js         server-rendered pages: home, product, demo, 404
src/chat.js          rule-based chat assistant (no AI cost)
src/mail.js          Resend email + templates
src/auth.js          admin password + signed session cookie
src/seed.js          initial products and settings
public/              CSS, JS, admin panel, product screenshots
```

## Security

Admin password checked in constant time, signed HttpOnly session cookie, cross-site request check on admin
writes, rate limits on login, contact form and chat, honeypot field against bots, all page output HTML-escaped,
uploads restricted to images.
