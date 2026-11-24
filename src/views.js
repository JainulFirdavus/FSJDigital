// Server-rendered public pages (fast first paint + good SEO, no front-end framework).
import { esc, videoEmbed, categoryLabel } from './util.js';

export const ASSET_V = (process.env.RENDER_GIT_COMMIT || String(Date.now())).slice(0, 8);
const asset = (p) => `${p}?v=${ASSET_V}`;
const abs = (base, src) => (/^https?:\/\//.test(src) ? src : `${base}${src}`);

const icons = {
  arrow: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 10h11m-4-4 4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7 5.5v9l7-4.5z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="m5 10.5 3 3 7-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chat: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  ext: '<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true"><path d="M8 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-3M11 4h5v5m0-5-7 7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------- building blocks ----------
export function frame(item, { eager = false, cls = '' } = {}) {
  const img = `<img src="${esc(item.src)}" alt="${esc(item.caption || '')}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  if (item.frame === 'phone') return `<figure class="frame frame-phone ${cls}">${img}</figure>`;
  if (item.frame === 'round') return `<figure class="frame frame-round ${cls}">${img}</figure>`;
  return `<figure class="frame frame-desktop ${cls}"><span class="frame-bar"><i></i><i></i><i></i></span>${img}</figure>`;
}

const priceTag = (p) => (p.price ? `<span class="price"><small>from</small> ${esc(p.price)}</span>` : '<span class="price price-quote">Get a quote</span>');

function header(site, active = '') {
  return `<header class="site-header"><div class="wrap nav">
  <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">${esc(site.siteName.slice(0, 1))}</span>${esc(site.siteName)}</a>
  <nav class="nav-links" aria-label="Main">
    <a href="/#products"${active === 'products' ? ' aria-current="page"' : ''}>Products</a>
    <a href="/#how">How it works</a>
    <a href="/#faq">FAQ</a>
    <a href="/#contact">Contact</a>
  </nav>
  <div class="row"><button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch to dark theme">Dark mode</button><a class="btn btn-primary btn-sm" href="/#contact">Book a demo</a></div>
</div></header>`;
}

function footer(site, products) {
  const contact = [
    site.contactEmail && `<a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a>`,
    site.phone && `<a href="tel:${esc(site.phone.replace(/[^\d+]/g, ''))}">${esc(site.phone)}</a>`,
    site.whatsapp && `<a href="https://wa.me/${esc(site.whatsapp.replace(/\D/g, ''))}" rel="noopener">WhatsApp</a>`,
    site.address && `<span>${esc(site.address)}</span>`,
  ].filter(Boolean).join('');
  return `<footer class="site-footer"><div class="wrap footer-grid">
  <div><a class="brand" href="/"><span class="brand-mark" aria-hidden="true">${esc(site.siteName.slice(0, 1))}</span>${esc(site.siteName)}</a><p class="muted">${esc(site.footerNote)}</p></div>
  <div><h4>Products</h4>${products.map((p) => `<a href="/products/${esc(p.slug)}">${esc(p.name)}</a>`).join('')}</div>
  <div><h4>Demos</h4>${products.map((p) => `<a href="/demo/${esc(p.slug)}">${esc(p.name)} demo</a>`).join('')}</div>
  <div><h4>Contact</h4>${contact || '<a href="/#contact">Send us a message</a>'}</div>
</div><div class="wrap footer-base muted">© ${new Date().getFullYear()} ${esc(site.siteName)}</div></footer>`;
}

const chatWidget = (site) => site.chatEnabled === false ? '' : `<div class="chat" data-chat data-greeting="${esc(site.chatGreeting)}">
  <button class="chat-toggle" type="button" aria-expanded="false" aria-controls="chat-panel" aria-label="Open chat">${icons.chat}</button>
  <section class="chat-panel" id="chat-panel" hidden aria-label="Chat with us">
    <header class="chat-head"><div><b>${esc(site.siteName)}</b><small>Usually replies by email</small></div><button type="button" class="chat-close" aria-label="Close chat">×</button></header>
    <div class="chat-log" role="log" aria-live="polite"></div>
    <form class="chat-input"><input name="q" autocomplete="off" maxlength="500" placeholder="Ask about a product…" aria-label="Your message"><button class="btn btn-primary btn-sm" type="submit">Send</button></form>
  </section>
</div>`;

export function contactForm(products, { product = '', title = 'Tell us what you need', intro = 'We reply by email, usually within one business day.' } = {}) {
  return `<form class="lead-form card" data-lead-form novalidate>
  <h3>${esc(title)}</h3><p class="muted">${esc(intro)}</p>
  <div class="field-row">
    <label>Name<input name="name" required maxlength="100" autocomplete="name"></label>
    <label>Email<input name="email" type="email" required maxlength="200" autocomplete="email"></label>
  </div>
  <div class="field-row">
    <label><span>Phone <span class="opt">(optional)</span></span><input name="phone" maxlength="40" autocomplete="tel"></label>
    <label><span>Company <span class="opt">(optional)</span></span><input name="company" maxlength="100" autocomplete="organization"></label>
  </div>
  <label>Interested in<select name="product">
    <option value="">General / not sure yet</option>
    ${products.map((p) => `<option${p.name === product ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}
    <option${product === 'Custom development' ? ' selected' : ''}>Custom development</option>
  </select></label>
  <label>Message<textarea name="message" required maxlength="4000" rows="4" placeholder="Your business, what you want to achieve, timeline…"></textarea></label>
  <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
  <button class="btn btn-primary" type="submit">Send message ${icons.arrow}</button>
  <p class="form-status" role="status"></p>
</form>`;
}

function layout({ site, base, path, title, description, image, body, jsonld, products, bodyClass = '' }) {
  const fullTitle = title ? `${title}` : `${site.siteName} — ${site.tagline}`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(description || site.heroSubtitle)}">
<link rel="canonical" href="${esc(base + path)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${esc(site.siteName)}">
<meta property="og:title" content="${esc(fullTitle)}"><meta property="og:description" content="${esc(description || site.heroSubtitle)}">
<meta property="og:url" content="${esc(base + path)}">${image ? `<meta property="og:image" content="${esc(abs(base, image))}"><meta name="twitter:card" content="summary_large_image">` : ''}
<meta name="theme-color" content="#3b5bdb">
<script>try { document.documentElement.dataset.theme = localStorage.getItem('fsjdigital-theme') || 'light'; } catch { document.documentElement.dataset.theme = 'light'; }</script>
<link rel="icon" href="/static/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="${asset('/static/css/site.css')}">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>` : ''}
</head><body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
${header(site)}
<main id="main">${body}</main>
${footer(site, products)}
${chatWidget(site)}
<script src="${asset('/static/js/site.js')}" defer></script>
</body></html>`;
}

function productCard(p) {
  const cover = p.gallery?.[0];
  return `<article class="product-card" data-category="${esc(p.category)}" style="--accent:${esc(p.color)}">
  <a class="product-cover cover-${esc(cover?.frame || 'none')}" href="/products/${esc(p.slug)}" tabindex="-1" aria-hidden="true">${cover ? frame(cover) : `<span class="cover-icon">${esc(p.icon)}</span>`}</a>
  <div class="product-body">
    <div class="product-meta"><span class="chip">${esc(categoryLabel[p.category])}</span><span class="muted small">${esc(p.platform)}</span></div>
    <h3><a href="/products/${esc(p.slug)}"><span aria-hidden="true">${esc(p.icon)}</span> ${esc(p.name)}</a></h3>
    <p class="muted">${esc(p.summary)}</p>
    <ul class="mini-features">${(p.features || []).slice(0, 3).map((f) => `<li>${icons.check}${esc(f.title)}</li>`).join('')}</ul>
    <div class="product-foot">${priceTag(p)}
      <span class="product-actions"><a class="btn btn-ghost btn-sm" href="/demo/${esc(p.slug)}">${p.demo?.type === 'live' ? `${icons.play} Live demo` : 'View demo'}</a><a class="btn btn-primary btn-sm" href="/products/${esc(p.slug)}">Details</a></span>
    </div>
  </div>
</article>`;
}

// ---------- pages ----------
export function homePage({ site, products, base }) {
  const pick = (frameType, skip = []) => products.flatMap((p) => (p.gallery || []).map((g) => ({ ...g, p }))).find((g) => g.frame === frameType && !skip.includes(g.p.slug));
  const heroDesk = pick('desktop');
  const heroPhone = pick('phone', [heroDesk?.p.slug]);
  const heroRound = pick('round');
  const webCount = products.filter((p) => p.category === 'web').length;
  const otherCount = products.length - webCount;
  const faq = site.faq || [];
  const body = `
<section class="hero"><div class="wrap hero-grid">
  <div class="hero-copy">
    <p class="eyebrow">${esc(site.tagline)}</p>
    <h1>${esc(site.heroTitle)}</h1>
    <p class="lead">${esc(site.heroSubtitle)}</p>
    <div class="hero-cta"><a class="btn btn-primary btn-lg" href="#products">Explore products ${icons.arrow}</a><a class="btn btn-ghost btn-lg" href="#contact">Talk to us</a></div>
    <ul class="hero-stats"><li><b>${products.length}</b> ready products</li><li><b>${webCount}</b> web · <b>${otherCount}</b> mobile & device</li><li><b>Your</b> brand & domain</li></ul>
  </div>
  <div class="hero-art" aria-hidden="true">
    ${heroDesk ? frame(heroDesk, { eager: true, cls: 'hero-desk' }) : ''}
    ${heroPhone ? frame(heroPhone, { eager: true, cls: 'hero-phone' }) : ''}
    ${heroRound ? frame(heroRound, { eager: true, cls: 'hero-round' }) : ''}
  </div>
</div></section>

<section class="section" id="products"><div class="wrap">
  <div class="section-head"><div><p class="eyebrow">Products</p><h2>Pick the product that fits your business</h2></div>
    <div class="tabs" role="tablist" aria-label="Filter products">
      <button role="tab" aria-selected="true" data-filter="all">All</button>
      <button role="tab" aria-selected="false" data-filter="web">Web</button>
      <button role="tab" aria-selected="false" data-filter="mobile">Mobile & devices</button>
    </div></div>
  <div class="product-grid">${products.map(productCard).join('')}</div>
</div></section>

<section class="section section-alt" id="how"><div class="wrap">
  <div class="section-head"><div><p class="eyebrow">How it works</p><h2>From demo to launch in three steps</h2></div></div>
  <ol class="steps">
    <li class="card"><span class="step-n">1</span><h3>Try the demo</h3><p class="muted">Click through each product's demo and pick what fits. ${site.chatEnabled === false ? 'Contact us' : 'Ask the chat or book a call'} any time.</p></li>
    <li class="card"><span class="step-n">2</span><h3>We brand & set up</h3><p class="muted">Your name, logo, colours and domain. We configure hosting, email and data for you.</p></li>
    <li class="card"><span class="step-n">3</span><h3>Launch & grow</h3><p class="muted">We train your team, keep the app updated and add the features you need next.</p></li>
  </ol>
  <div class="services">
    <div><h3>Need something custom?</h3><p class="muted">We also build new web, mobile and IoT products — or adapt any of ours to your workflow.</p></div>
    <a class="btn btn-primary" href="#contact" data-product="Custom development">Discuss a custom build ${icons.arrow}</a>
  </div>
</div></section>

${faq.length ? `<section class="section" id="faq"><div class="wrap narrow">
  <div class="section-head"><div><p class="eyebrow">FAQ</p><h2>Questions, answered</h2></div></div>
  <div class="faq">${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>
</div></section>` : ''}

<section class="section section-alt" id="contact"><div class="wrap contact-grid">
  <div><p class="eyebrow">Contact</p><h2>Let's talk about your business</h2>
    <p class="lead">Tell us which product interests you, or describe what you need. You'll get a reply by email.</p>
    <ul class="contact-points">
      ${site.contactEmail ? `<li><span>Email</span><a href="mailto:${esc(site.contactEmail)}">${esc(site.contactEmail)}</a></li>` : ''}
      ${site.phone ? `<li><span>Phone</span><a href="tel:${esc(site.phone.replace(/[^\d+]/g, ''))}">${esc(site.phone)}</a></li>` : ''}
      ${site.whatsapp ? `<li><span>WhatsApp</span><a href="https://wa.me/${esc(site.whatsapp.replace(/\D/g, ''))}" rel="noopener">Chat on WhatsApp</a></li>` : ''}
      ${site.chatEnabled === false ? '' : '<li><span>Chat</span><button type="button" class="link" data-open-chat>Open the chat assistant</button></li>'}
    </ul>
  </div>
  ${contactForm(products)}
</div></section>`;
  return layout({
    site, base, path: '/', products, body,
    image: heroDesk?.src,
    jsonld: { '@context': 'https://schema.org', '@type': 'Organization', name: site.siteName, url: base, description: site.heroSubtitle,
      ...(site.contactEmail ? { email: site.contactEmail } : {}) },
  });
}

export function productPage({ site, products, product: p, base }) {
  const others = products.filter((x) => x.slug !== p.slug).slice(0, 3);
  const cover = p.gallery?.[0];
  const paragraphs = (p.description || '').split(/\n{2,}/).map((x) => `<p>${esc(x)}</p>`).join('');
  const body = `
<section class="product-hero" style="--accent:${esc(p.color)}"><div class="wrap product-hero-grid">
  <div>
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/#products">Products</a> / <span>${esc(p.name)}</span></nav>
    <div class="product-meta"><span class="chip">${esc(categoryLabel[p.category])}</span><span class="muted small">${esc(p.platform)}</span></div>
    <h1><span aria-hidden="true">${esc(p.icon)}</span> ${esc(p.name)}</h1>
    <p class="lead">${esc(p.tagline)}</p>
    <p class="muted">${esc(p.summary)}</p>
    <div class="hero-cta"><a class="btn btn-primary btn-lg" href="/demo/${esc(p.slug)}">${p.demo?.type === 'live' ? `${icons.play} Try the live demo` : `${icons.play} View the demo`}</a><a class="btn btn-ghost btn-lg" href="#quote">Request a quote</a></div>
    <p class="price-line">${priceTag(p)}${p.priceNote ? `<span class="muted small">${esc(p.priceNote)}</span>` : ''}</p>
  </div>
  <div class="product-hero-art cover-${esc(cover?.frame || 'none')}">${cover ? frame(cover, { eager: true }) : ''}</div>
</div></section>

<section class="section"><div class="wrap">
  <div class="section-head"><div><p class="eyebrow">Features</p><h2>What ${esc(p.name)} does</h2></div></div>
  <div class="feature-grid">${(p.features || []).map((f) => `<div class="feature card" style="--accent:${esc(p.color)}"><span class="feature-icon">${icons.check}</span><h3>${esc(f.title)}</h3><p class="muted">${esc(f.text)}</p></div>`).join('')}</div>
</div></section>

${(p.gallery || []).length > 1 ? `<section class="section section-alt"><div class="wrap">
  <div class="section-head"><div><p class="eyebrow">Screens</p><h2>A look inside</h2></div><a class="btn btn-ghost" href="/demo/${esc(p.slug)}">Open the full demo ${icons.arrow}</a></div>
  <div class="shot-grid">${p.gallery.map((g, i) => `<a class="shot shot-${esc(g.frame)}" href="/demo/${esc(p.slug)}#shot-${i}">${frame(g)}<span>${esc(g.caption)}</span></a>`).join('')}</div>
</div></section>` : ''}

<section class="section"><div class="wrap about-grid">
  <div class="prose"><p class="eyebrow">Overview</p><h2>About ${esc(p.name)}</h2>${paragraphs}</div>
  <aside class="card spec">
    <h3>At a glance</h3>
    <dl><dt>Type</dt><dd>${esc(categoryLabel[p.category])}</dd><dt>Platform</dt><dd>${esc(p.platform)}</dd>
    ${(p.tech || []).length ? `<dt>Built with</dt><dd class="chips">${p.tech.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</dd>` : ''}
    <dt>Pricing</dt><dd>${p.price ? `From ${esc(p.price)}` : 'Custom quote'}${p.priceNote ? ` · ${esc(p.priceNote)}` : ''}</dd>
    <dt>Includes</dt><dd>Your branding, setup and training</dd></dl>
  </aside>
</div></section>

<section class="section section-alt" id="quote"><div class="wrap contact-grid">
  <div><p class="eyebrow">Get ${esc(p.name)}</p><h2>Request a quote or a live walkthrough</h2><p class="lead">Tell us a little about your business and we'll send pricing and next steps by email.</p></div>
  ${contactForm(products, { product: p.name, title: `Ask about ${p.name}` })}
</div></section>

${others.length ? `<section class="section"><div class="wrap"><div class="section-head"><div><p class="eyebrow">More products</p><h2>You might also like</h2></div></div>
  <div class="product-grid">${others.map(productCard).join('')}</div></div></section>` : ''}`;
  return layout({
    site, base, path: `/products/${p.slug}`, products, body,
    title: p.metaTitle || `${p.name} — ${site.siteName}`,
    description: p.metaDescription || p.summary,
    image: cover?.src,
    jsonld: {
      '@context': 'https://schema.org', '@type': p.category === 'device' ? 'Product' : 'SoftwareApplication',
      name: p.name, description: p.metaDescription || p.summary, url: `${base}/products/${p.slug}`,
      ...(cover ? { image: abs(base, cover.src) } : {}),
      ...(p.category !== 'device' ? { applicationCategory: 'BusinessApplication', operatingSystem: p.platform } : {}),
      brand: { '@type': 'Organization', name: site.siteName },
    },
  });
}

export function demoPage({ site, products, product: p, base }) {
  const live = p.demo?.type === 'live' && p.demo.url;
  const video = videoEmbed(p.videoUrl);
  const gallery = p.gallery || [];
  const body = `
<section class="demo-top" style="--accent:${esc(p.color)}"><div class="wrap demo-top-row">
  <div><nav class="crumbs" aria-label="Breadcrumb"><a href="/#products">Products</a> / <a href="/products/${esc(p.slug)}">${esc(p.name)}</a> / <span>Demo</span></nav>
    <h1><span aria-hidden="true">${esc(p.icon)}</span> ${esc(p.name)} demo</h1>
    <p class="muted">${live ? 'Click around the real app below — it is a live sample.' : 'Take a guided tour of the real screens. Use the arrows or thumbnails.'}</p></div>
  <div class="demo-actions"><a class="btn btn-ghost" href="/products/${esc(p.slug)}">Product details</a><a class="btn btn-primary" href="#quote">Request a quote</a></div>
</div></section>

${live ? `<section class="section section-tight"><div class="wrap">
  <div class="live-bar">
    <div class="seg" role="group" aria-label="Preview size">
      <button type="button" data-device="desktop" aria-pressed="${p.demo.device !== 'phone'}">Desktop</button>
      <button type="button" data-device="phone" aria-pressed="${p.demo.device === 'phone'}">Phone</button>
    </div>
    <a class="btn btn-ghost btn-sm" href="${esc(p.demo.url)}" target="_blank" rel="noopener">Open in new tab ${icons.ext}</a>
  </div>
  <div class="live-stage" data-live data-device="${p.demo.device === 'phone' ? 'phone' : 'desktop'}">
    <div class="live-frame"><div class="live-loading"><span class="spinner"></span><p>Loading the live demo…</p><small class="muted">${esc(p.demo.note || 'This can take a few seconds.')}</small></div>
      <iframe src="${esc(p.demo.url)}" title="${esc(p.name)} live demo" loading="lazy" referrerpolicy="no-referrer-when-downgrade" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></div>
  </div>
  ${p.demo.note ? `<p class="muted small center">${esc(p.demo.note)}</p>` : ''}
</div></section>` : ''}

${video ? `<section class="section section-tight"><div class="wrap narrow">
  <h2 class="h3">Watch the walkthrough</h2>
  <div class="video ${video.vertical ? 'video-vertical' : ''}">${video.kind === 'iframe'
    ? `<iframe src="${esc(video.src)}" title="${esc(p.name)} video" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`
    : `<video src="${esc(video.src)}" controls preload="metadata" playsinline></video>`}</div>
</div></section>` : ''}

${gallery.length ? `<section class="section ${live ? 'section-alt' : 'section-tight'}"><div class="wrap">
  ${live ? '<h2 class="h3">Screen tour</h2>' : ''}
  <div class="tour" data-tour style="--accent:${esc(p.color)}">
    <div class="tour-stage">
      <button class="tour-nav prev" type="button" aria-label="Previous screen">‹</button>
      ${gallery.map((g, i) => `<div class="tour-slide" id="shot-${i}" data-frame="${esc(g.frame)}"${i ? ' hidden' : ''}>${frame(g, { eager: i === 0 })}</div>`).join('')}
      <button class="tour-nav next" type="button" aria-label="Next screen">›</button>
    </div>
    <p class="tour-caption" aria-live="polite"><b>1 / ${gallery.length}</b> <span>${esc(gallery[0].caption)}</span></p>
    <div class="tour-thumbs">${gallery.map((g, i) => `<button type="button" data-i="${i}" data-caption="${esc(g.caption)}" aria-label="${esc(g.caption || `Screen ${i + 1}`)}"${i ? '' : ' aria-current="true"'}><img src="${esc(g.src)}" alt="" loading="lazy"></button>`).join('')}</div>
  </div>
</div></section>` : ''}

<section class="section section-alt" id="quote"><div class="wrap contact-grid">
  <div><p class="eyebrow">Like what you see?</p><h2>Get ${esc(p.name)} for your business</h2>
    <ul class="checks">${(p.features || []).slice(0, 5).map((f) => `<li>${icons.check}${esc(f.title)}</li>`).join('')}</ul></div>
  ${contactForm(products, { product: p.name, title: live ? 'Book a guided walkthrough' : 'Request a live walkthrough', intro: 'We will show you everything on a call and answer your questions.' })}
</div></section>`;
  return layout({
    site, base, path: `/demo/${p.slug}`, products, body, bodyClass: 'demo',
    title: `${p.name} demo — ${site.siteName}`,
    description: `Try ${p.name}: ${p.tagline}`,
    image: gallery[0]?.src,
  });
}

export function notFoundPage({ site, products, base }) {
  return layout({ site, base, path: '/404', products, title: `Page not found — ${site.siteName}`,
    body: `<section class="section"><div class="wrap narrow center"><h1>Page not found</h1><p class="lead">That page doesn't exist. Try one of our products instead.</p><a class="btn btn-primary" href="/#products">See products</a></div></section>` });
}
