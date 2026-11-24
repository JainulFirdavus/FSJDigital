// Admin panel (no framework): inquiries + email replies, product CMS, site settings.
(() => {
  const app = document.getElementById('app');
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const e = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const $ = (s, el = app) => el.querySelector(s);
  const $$ = (s, el = app) => [...el.querySelectorAll(s)];
  const fmt = (d) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  const CATS = { web: 'Web app', mobile: 'Mobile app', device: 'Smart device' };
  let state = { mail: true, counts: {} };

  const themeKey = 'fsjdigital-theme';
  const setTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem(themeKey, theme); } catch { /* theme still applies for this page */ }
    $$('[data-theme-toggle]').forEach((button) => {
      const next = theme === 'dark' ? 'light' : 'dark';
      button.textContent = `${next === 'dark' ? 'Dark' : 'Light'} mode`;
      button.setAttribute('aria-label', `Switch to ${next} theme`);
    });
  };
  setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-theme-toggle]')) {
      setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    }
  });

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(`/api/admin${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/login') { renderLogin(); throw new Error('Please sign in.'); }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // ---------- login ----------
  function renderLogin(msg = '') {
    app.className = '';
    app.innerHTML = `<div class="login"><form class="card">
      <div class="row"><span class="spacer"></span><button class="theme-toggle btn sm" type="button" data-theme-toggle>Dark mode</button></div>
      <h1>Admin sign in</h1><p class="muted small">Manage products, inquiries and site content.</p>
      <label>Password<input type="password" name="password" autocomplete="current-password" required autofocus></label>
      <p class="err">${e(msg)}</p>
      <button class="btn primary" type="submit">Sign in</button></form></div>`;
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
    $('form').onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        await api('/login', { method: 'POST', body: { password: ev.target.password.value } });
        route();
      } catch (err) { $('.err').textContent = err.message; }
    };
  }

  // ---------- shell ----------
  function shell(active, content) {
    const n = state.counts.new || 0;
    app.className = '';
    app.innerHTML = `<div class="shell">
      <nav class="side" aria-label="Admin">
        <div class="logo">⚙️ Admin</div>
        <a href="#inquiries" class="${active === 'inquiries' ? 'active' : ''}">Inquiries ${n ? `<span class="badge">${n}</span>` : ''}</a>
        <a href="#products" class="${active === 'products' ? 'active' : ''}">Products</a>
        <a href="#configuration/general" class="${active === 'configuration' ? 'active' : ''}">Configuration</a>
        ${active === 'configuration' ? `<div class="config-links">
          <a href="#configuration/general" class="${location.hash === '#configuration/general' ? 'active' : ''}">General</a>
          <a href="#configuration/mail" class="${location.hash === '#configuration/mail' ? 'active' : ''}">Mail</a>
          <a href="#configuration/chatbot" class="${location.hash === '#configuration/chatbot' ? 'active' : ''}">Chatbot</a>
        </div>` : ''}
        <div class="bottom"><button class="theme-toggle btn sm" type="button" data-theme-toggle>Dark mode</button><a href="/" target="_blank" rel="noopener">View site ↗</a><a href="#logout">Sign out</a></div>
      </nav>
      <main>${state.mail ? '' : '<div class="banner"><b>Email is not set up.</b> Replies are saved here but not emailed. Add <code>RESEND_API_KEY</code> to the server environment and configure a sender in Site settings.</div>'}${content}</main>
    </div>`;
    setTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  }

  async function refreshCounts() {
    try { const o = await api('/overview'); state.counts = o.counts; state.mail = o.mail; } catch { /* handled */ }
  }

  // ---------- inquiries ----------
  async function renderInquiries(status = sessionStorage.getItem('inqFilter') || 'new') {
    await refreshCounts();
    const rows = await api(`/inquiries?status=${status}`);
    const tab = (k, label) => `<button data-s="${k}" class="${status === k ? 'on' : ''}">${label}${k !== 'all' && state.counts[k] ? ` (${state.counts[k]})` : ''}</button>`;
    shell('inquiries', `<div class="page-head"><h1>Inquiries</h1><span class="spacer"></span>
      <div class="tabs">${tab('new', 'New')}${tab('replied', 'Replied')}${tab('closed', 'Closed')}${tab('all', 'All')}</div></div>
      ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>From</th><th>Product</th><th>Message</th><th>Source</th><th>Received</th><th>Status</th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-id="${e(r.id)}" class="${r.status === 'new' ? 'is-new' : ''}"><td>${e(r.name)}<div class="muted small">${e(r.email)}</div></td>
        <td>${e(r.product || '—')}</td><td class="muted">${e(r.preview)}</td><td>${r.source === 'chat' ? '💬 Chat' : '📝 Form'}</td>
        <td class="small">${fmt(r.created_at)}</td><td><span class="pill ${e(r.status)}">${e(r.status)}</span></td></tr>`).join('')}
      </tbody></table></div>` : '<div class="card empty">No inquiries here yet.</div>'}`);
    $$('.tabs button').forEach((b) => (b.onclick = () => { sessionStorage.setItem('inqFilter', b.dataset.s); renderInquiries(b.dataset.s); }));
    $$('tbody tr').forEach((tr) => (tr.onclick = () => (location.hash = `inquiry/${tr.dataset.id}`)));
  }

  async function renderInquiry(id) {
    await refreshCounts();
    const q = await api(`/inquiries/${id}`);
    const emailPill = (s) => (!s ? '' : s === 'note' ? '<span class="pill">internal note</span>' : `<span class="pill ${s.startsWith('failed') ? 'failed' : e(s)}">${s === 'sent' ? '✓ emailed' : s === 'not_configured' ? 'not emailed (mail not set up)' : e(s)}</span>`);
    shell('inquiries', `<div class="page-head"><a class="btn sm" href="#inquiries">← Back</a><h1>${e(q.name)}</h1><span class="pill ${e(q.status)}">${e(q.status)}</span><span class="spacer"></span>
        <select id="status" style="width:auto"><option value="new">New</option><option value="replied">Replied</option><option value="closed">Closed</option></select>
        <button class="btn danger sm" id="del">Delete</button></div>
      <div class="card"><dl class="kv">
        <dt>Email</dt><dd><a href="mailto:${e(q.email)}">${e(q.email)}</a></dd>
        ${q.phone ? `<dt>Phone</dt><dd><a href="tel:${e(q.phone)}">${e(q.phone)}</a> · <a href="https://wa.me/${e(q.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a></dd>` : ''}
        ${q.company ? `<dt>Company</dt><dd>${e(q.company)}</dd>` : ''}
        <dt>Product</dt><dd>${e(q.product || 'General')}</dd><dt>Source</dt><dd>${q.source === 'chat' ? 'Chat assistant' : 'Contact form'}</dd><dt>Received</dt><dd>${fmt(q.created_at)}</dd></dl></div>
      <div class="thread">${q.messages.map((m) => `<div class="bubble ${m.direction}"><div class="meta"><b>${m.direction === 'in' ? e(q.name) : 'You'}</b><span>${fmt(m.created_at)}</span>${m.direction === 'out' ? emailPill(m.email_status) : ''}</div>${e(m.body)}</div>`).join('')}</div>
      <form class="card stack" id="reply"><h2>Reply</h2>
        <label>Message<textarea name="body" rows="7" required placeholder="Hi ${e(q.name.split(' ')[0])}, thanks for your interest in ${e(q.product || 'our products')}…"></textarea></label>
        <div class="row"><label class="inline"><input type="checkbox" name="sendEmail" checked> Email this reply to ${e(q.email)}</label><span class="spacer"></span>
        <button class="btn primary" type="submit">Send reply</button></div>
        <p class="muted small" style="margin:0">The customer's answer comes back to your inbox (reply-to is your admin email).</p></form>`);
    $('#status').value = q.status;
    $('#status').onchange = async (ev) => { await api(`/inquiries/${id}`, { method: 'PATCH', body: { status: ev.target.value } }); toast('Status updated'); renderInquiry(id); };
    $('#del').onclick = async () => { if (!confirm('Delete this inquiry and its messages?')) return; await api(`/inquiries/${id}`, { method: 'DELETE' }); toast('Deleted'); location.hash = 'inquiries'; };
    $('#reply').onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const btn = $('button[type="submit"]', f);
      btn.disabled = true;
      try {
        const r = await api(`/inquiries/${id}/reply`, { method: 'POST', body: { body: f.body.value, sendEmail: f.sendEmail.checked } });
        toast(r.emailStatus === 'sent' ? 'Reply emailed ✓' : r.emailStatus === 'note' ? 'Note saved' : `Saved — email ${r.emailStatus}`);
        renderInquiry(id);
      } catch (err) { toast(err.message); btn.disabled = false; }
    };
  }

  // ---------- products ----------
  async function renderProducts() {
    const list = await api('/products');
    shell('products', `<div class="page-head"><h1>Products</h1><span class="spacer"></span><a class="btn primary" href="#product/new">+ New product</a></div>
      <div class="plist">${list.map((p) => `<div class="card pitem">
        ${p.gallery?.[0] ? `<img src="${e(p.gallery[0].src)}" alt="">` : '<img alt="">'}
        <div style="flex:1;min-width:0"><div class="name">${e(p.icon)} ${e(p.name)} ${p.published ? '' : '<span class="pill">hidden</span>'}</div>
        <div class="muted small">${e(CATS[p.category])} · ${e(p.platform)} · demo: ${p.demo?.type === 'live' ? 'live' : 'screens'}${p.videoUrl ? ' + video' : ''}</div></div>
        <a class="btn sm" href="/products/${e(p.slug)}" target="_blank" rel="noopener">View ↗</a><a class="btn sm primary" href="#product/${e(p.id)}">Edit</a></div>`).join('')}</div>`);
  }

  const blank = () => ({ name: '', slug: '', category: 'web', platform: '', icon: '✨', color: '#3b5bdb', tagline: '', summary: '', description: '', features: [], tech: [], price: '', priceNote: '', demo: { type: 'gallery', url: '', device: 'desktop', note: '' }, videoUrl: '', gallery: [], keywords: [], metaTitle: '', metaDescription: '', published: true, sortOrder: 99 });

  async function renderProduct(id) {
    const list = await api('/products');
    const p = id === 'new' ? blank() : list.find((x) => x.id === id);
    if (!p) { location.hash = 'products'; return; }
    let gallery = (p.gallery || []).map((g) => ({ ...g }));
    const featuresText = (p.features || []).map((f) => (f.text ? `${f.title} — ${f.text}` : f.title)).join('\n');
    shell('products', `<div class="page-head"><a class="btn sm" href="#products">← Products</a><h1>${id === 'new' ? 'New product' : e(p.name)}</h1><span class="spacer"></span>
        ${id !== 'new' ? `<a class="btn sm" href="/products/${e(p.slug)}" target="_blank" rel="noopener">Page ↗</a><a class="btn sm" href="/demo/${e(p.slug)}" target="_blank" rel="noopener">Demo ↗</a>` : ''}</div>
      <form id="pf" class="stack">
      <div class="card stack"><h2>Basics</h2>
        <div class="grid3"><label>Name<input name="name" required maxlength="80" value="${e(p.name)}"></label>
          <label>Link (slug) <span class="hint">/products/…</span><input name="slug" maxlength="60" value="${e(p.slug)}" placeholder="auto from name"></label>
          <label>Category<select name="category">${Object.entries(CATS).map(([k, v]) => `<option value="${k}"${p.category === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>
        <div class="grid3"><label>Platform<input name="platform" maxlength="80" value="${e(p.platform)}" placeholder="Web app · Android"></label>
          <label>Icon (emoji)<input name="icon" maxlength="8" value="${e(p.icon)}"></label>
          <label>Accent colour<input type="color" name="color" value="${e(p.color)}"></label></div>
        <label>Tagline<input name="tagline" maxlength="160" value="${e(p.tagline)}"></label>
        <label>Card summary<textarea name="summary" maxlength="400" rows="2">${e(p.summary)}</textarea></label>
        <label>Full description <span class="hint">Blank line = new paragraph</span><textarea name="description" maxlength="6000" rows="7">${e(p.description)}</textarea></label>
        <label>Features <span class="hint">One per line: Title — short detail</span><textarea name="features" rows="8">${e(featuresText)}</textarea></label>
        <div class="grid2"><label>Built with <span class="hint">comma separated</span><input name="tech" value="${e((p.tech || []).join(', '))}"></label>
          <label>Chatbot keywords <span class="hint">comma separated</span><input name="keywords" value="${e((p.keywords || []).join(', '))}"></label></div>
      </div>
      <div class="card stack"><h2>Pricing</h2>
        <div class="grid2"><label>Price <span class="hint">e.g. RM 2,500 — leave empty to show “Get a quote”</span><input name="price" maxlength="40" value="${e(p.price)}"></label>
          <label>Price note<input name="priceNote" maxlength="80" value="${e(p.priceNote)}" placeholder="One-time licence"></label></div></div>
      <div class="card stack"><h2>Demo page</h2>
        <div class="grid3"><label>Demo type<select name="demoType"><option value="gallery"${p.demo?.type !== 'live' ? ' selected' : ''}>Screens tour (images)</option><option value="live"${p.demo?.type === 'live' ? ' selected' : ''}>Live app (embedded)</option></select></label>
          <label>Live demo URL<input name="demoUrl" type="url" value="${e(p.demo?.url)}" placeholder="https://…"></label>
          <label>Default view<select name="demoDevice"><option value="desktop">Desktop</option><option value="phone"${p.demo?.device === 'phone' ? ' selected' : ''}>Phone</option></select></label></div>
        <label>Demo note <span class="hint">shown under the live demo (e.g. demo login)</span><input name="demoNote" maxlength="300" value="${e(p.demo?.note)}"></label>
        <label>Video URL <span class="hint">YouTube (unlisted is fine), Vimeo, Google Drive or a direct .mp4 link</span><input name="videoUrl" type="url" value="${e(p.videoUrl)}" placeholder="https://youtu.be/…"></label>
      </div>
      <div class="card stack"><div class="section-title"><h2 style="margin:0">Images</h2><span class="row">
        <label class="btn sm" style="display:inline-flex">Upload images<input type="file" id="upload" accept="image/*" multiple hidden></label>
        <button type="button" class="btn sm" id="addUrl">Add by URL</button></span></div>
        <p class="muted small" style="margin:0">The first image is the cover. Frame: <b>desktop</b> for wide screenshots, <b>phone</b> for mobile screens, <b>round</b> for watch faces.</p>
        <div class="gallery" id="gallery"></div></div>
      <div class="card stack"><h2>SEO & visibility</h2>
        <label>Meta title<input name="metaTitle" maxlength="120" value="${e(p.metaTitle)}"></label>
        <label>Meta description<textarea name="metaDescription" maxlength="300" rows="2">${e(p.metaDescription)}</textarea></label>
        <div class="row"><label class="inline"><input type="checkbox" name="published"${p.published ? ' checked' : ''}> Published</label>
          <label class="inline">Order <input type="number" name="sortOrder" value="${e(p.sortOrder)}" style="width:90px"></label></div></div>
      <div class="sticky-actions"><button class="btn primary" type="submit">Save product</button>${id !== 'new' ? '<button class="btn danger" type="button" id="delP">Delete</button>' : ''}</div>
      </form>`);

    const drawGallery = () => {
      $('#gallery').innerHTML = gallery.length ? gallery.map((g, i) => `<div class="gitem" data-i="${i}"><img src="${e(g.src)}" alt="">
        <div class="fields"><input data-k="caption" value="${e(g.caption)}" placeholder="Caption"><select data-k="frame">${['desktop', 'phone', 'round'].map((f) => `<option${g.frame === f ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
        <div class="ctrl"><button type="button" class="btn sm" data-a="up" aria-label="Move up">↑</button><button type="button" class="btn sm" data-a="down" aria-label="Move down">↓</button><button type="button" class="btn sm danger" data-a="rm" aria-label="Remove">✕</button></div></div>`).join('')
        : '<div class="empty">No images yet.</div>';
      $$('.gitem').forEach((row) => {
        const i = Number(row.dataset.i);
        $$('[data-k]', row).forEach((inp) => (inp.oninput = () => { gallery[i][inp.dataset.k] = inp.value; }));
        $$('[data-a]', row).forEach((b) => (b.onclick = () => {
          const a = b.dataset.a;
          if (a === 'rm') gallery.splice(i, 1);
          if (a === 'up' && i > 0) [gallery[i - 1], gallery[i]] = [gallery[i], gallery[i - 1]];
          if (a === 'down' && i < gallery.length - 1) [gallery[i + 1], gallery[i]] = [gallery[i], gallery[i + 1]];
          drawGallery();
        }));
      });
    };
    drawGallery();

    $('#upload').onchange = async (ev) => {
      for (const file of ev.target.files) {
        try {
          toast(`Uploading ${file.name}…`);
          const { mime, data, w, h } = await prepareImage(file);
          const r = await api('/media', { method: 'POST', body: { mime, data } });
          gallery.push({ src: r.url, caption: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), frame: h > w * 1.4 ? 'phone' : 'desktop' });
          drawGallery();
        } catch (err) { toast(err.message); }
      }
      ev.target.value = '';
      toast('Upload finished — remember to save');
    };
    $('#addUrl').onclick = () => {
      const url = prompt('Image URL (https://…)');
      if (url && /^https?:\/\//.test(url)) { gallery.push({ src: url, caption: '', frame: 'desktop' }); drawGallery(); }
    };

    $('#pf').onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const list = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
      const body = {
        name: f.name.value, slug: f.slug.value, category: f.category.value, platform: f.platform.value, icon: f.icon.value, color: f.color.value,
        tagline: f.tagline.value, summary: f.summary.value, description: f.description.value,
        features: f.features.value.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [t, ...rest] = l.split(/\s+[—–-]\s+/); return { title: t, text: rest.join(' — ') }; }),
        tech: list(f.tech.value), keywords: list(f.keywords.value), price: f.price.value, priceNote: f.priceNote.value,
        demo: { type: f.demoType.value, url: f.demoUrl.value, device: f.demoDevice.value, note: f.demoNote.value },
        videoUrl: f.videoUrl.value, gallery, metaTitle: f.metaTitle.value, metaDescription: f.metaDescription.value,
        published: f.published.checked, sortOrder: Number(f.sortOrder.value) || 0,
      };
      try {
        const saved = id === 'new' ? await api('/products', { method: 'POST', body }) : await api(`/products/${id}`, { method: 'PUT', body });
        toast('Product saved ✓');
        location.hash = `product/${saved.id}`;
        if (id !== 'new') renderProduct(saved.id);
      } catch (err) { toast(err.message); }
    };
    const del = $('#delP');
    if (del) del.onclick = async () => { if (!confirm(`Delete ${p.name}? This cannot be undone.`)) return; await api(`/products/${id}`, { method: 'DELETE' }); toast('Deleted'); location.hash = 'products'; };
  }

  // Resize big images in the browser before upload (keeps the database small).
  function prepareImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return reject(new Error('Use JPG, PNG, WebP or GIF.'));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read the file.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Not a valid image.'));
        img.onload = () => {
          if (file.type === 'image/gif') {
            if (file.size > 2_800_000) return reject(new Error('GIF is too large (max 2.8 MB).'));
            return resolve({ mime: file.type, data: reader.result, w: img.width, h: img.height });
          }
          const max = 1600;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          const data = c.toDataURL('image/webp', 0.84);
          const webp = data.startsWith('data:image/webp');
          resolve({ mime: webp ? 'image/webp' : 'image/jpeg', data: webp ? data : c.toDataURL('image/jpeg', 0.84), w: c.width, h: c.height });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------- settings ----------
  async function renderSettings(section = 'general') {
    if (!['general', 'mail', 'chatbot'].includes(section)) section = 'general';
    const s = await api('/settings');
    state.mail = s.mailConfigured;
    let faq = (s.faq || []).map((x) => ({ ...x }));
    const field = (k, label, hint = '', type = 'input') => `<label>${label}${hint ? ` <span class="hint">${hint}</span>` : ''}${type === 'textarea' ? `<textarea name="${k}" rows="3">${e(s[k])}</textarea>` : `<input name="${k}"${type === 'email' ? ' type="email"' : ''} value="${e(s[k])}">`}</label>`;
    const toggle = (k, label, hint = '') => `<label class="inline"><input type="checkbox" name="${k}"${s[k] ? ' checked' : ''}>${label}${hint ? ` <span class="hint">${hint}</span>` : ''}</label>`;
    const general = `<div class="card stack"><h2>Brand & hero</h2><div class="grid2">${field('siteName', 'Business name')}${field('tagline', 'Tagline', 'small text above the headline')}</div>
        ${field('heroTitle', 'Headline')}${field('heroSubtitle', 'Sub-headline', '', 'textarea')}${field('footerNote', 'Footer text')}</div>
      <div class="card stack"><h2>Contact details</h2><div class="grid2">${field('contactEmail', 'Public email', 'shown to visitors', 'email')}${field('phone', 'Phone')}
        ${field('whatsapp', 'WhatsApp number', 'with country code, e.g. 60123456789')}${field('address', 'Address / city')}</div></div>
      <div class="card stack"><h2>Messages</h2>${field('ackMessage', 'Auto-reply email', 'sent to every new inquiry', 'textarea')}</div>
      <div class="card stack"><div class="section-title"><h2 style="margin:0">FAQ</h2><button type="button" class="btn sm" id="addFaq">+ Add question</button></div><div class="stack" id="faq"></div></div>`;
    const mail = `<div class="card stack"><h2>Mail delivery</h2>
        <p class="muted small" style="margin:0">${s.mailConfigured ? 'Mail is ready to send.' : 'Mail is not ready to send.'} Resend API key: ${s.mailApiKeyConfigured ? 'configured on server' : 'missing from server environment'}.</p>
        <div class="grid2">${field('mailFrom', 'Sender name and email', 'e.g. FSJ Digital <hello@example.com>')}${field('notificationEmail', 'Inquiry notification email', 'receives new inquiry alerts', 'email')}</div>
        <p class="hint" style="margin:0">Keep <code>RESEND_API_KEY</code> in the server environment; it is never stored in the database.</p></div>`;
    const chatbot = `<div class="card stack"><h2>Chat assistant</h2>${toggle('chatEnabled', 'Enable the public chatbot')}
        ${field('chatGreeting', 'Chat greeting', 'shown when a visitor opens chat', 'textarea')}
        ${field('chatFallback', 'Fallback response', 'used when the bot cannot answer or lead capture is disabled', 'textarea')}
        ${toggle('chatCollectLeads', 'Allow the chatbot to collect lead details', 'otherwise visitors are sent to the contact form')}</div>`;
    const content = { general, mail, chatbot }[section] || general;
    const title = { general: 'General configuration', mail: 'Mail configuration', chatbot: 'Chatbot configuration' }[section] || 'General configuration';
    shell('configuration', `<div class="page-head"><h1>${title}</h1></div><form id="sf" class="stack">${content}
      <div class="sticky-actions"><button class="btn primary" type="submit">Save configuration</button></div></form>`);
    const drawFaq = () => {
      if (!$('#faq')) return;
      $('#faq').innerHTML = faq.map((x, i) => `<div class="faq-row" data-i="${i}"><input data-k="q" value="${e(x.q)}" placeholder="Question"><textarea data-k="a" rows="2" placeholder="Answer">${e(x.a)}</textarea><button type="button" class="btn sm danger" aria-label="Remove">✕</button></div>`).join('') || '<p class="muted">No questions.</p>';
      $$('.faq-row').forEach((row) => {
        const i = Number(row.dataset.i);
        $$('[data-k]', row).forEach((inp) => (inp.oninput = () => { faq[i][inp.dataset.k] = inp.value; }));
        $('button', row).onclick = () => { faq.splice(i, 1); drawFaq(); };
      });
    };
    if (section === 'general') {
      drawFaq();
      $('#addFaq').onclick = () => { faq.push({ q: '', a: '' }); drawFaq(); };
    }
    $('#sf').onsubmit = async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const body = Object.fromEntries(new FormData(f));
      if (section === 'chatbot') {
        body.chatEnabled = f.chatEnabled.checked;
        body.chatCollectLeads = f.chatCollectLeads.checked;
      }
      if (section === 'general') body.faq = faq;
      try { await api('/settings', { method: 'PUT', body }); toast('Configuration saved ✓'); await renderSettings(section); } catch (err) { toast(err.message); }
    };
  }

  // ---------- router ----------
  async function route() {
    const h = location.hash.slice(1) || 'inquiries';
    try {
      if (h === 'logout') { await api('/logout', { method: 'POST' }); location.hash = ''; renderLogin('Signed out.'); return; }
      const sess = await api('/session');
      state.mail = sess.mail;
      if (!sess.authenticated) return renderLogin();
      if (h === 'inquiries') return await renderInquiries();
      if (h.startsWith('inquiry/')) return await renderInquiry(h.split('/')[1]);
      if (h === 'products') return await renderProducts();
      if (h.startsWith('product/')) return await renderProduct(h.split('/')[1]);
      if (h === 'settings') { location.hash = 'configuration/general'; return; }
      if (h.startsWith('configuration/')) return await renderSettings(h.split('/')[1]);
      location.hash = 'inquiries';
    } catch (err) { if (err.message !== 'Please sign in.') toast(err.message); }
  }
  window.addEventListener('hashchange', route);
  route();
})();
