// Public site behaviour: product filter, inquiry forms, demo viewer and chat assistant.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const postJson = async (url, data) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'Something went wrong. Please try again.');
    return body;
  };

  // ----- product filter -----
  $$('[data-filter]').forEach((btn) => btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    $$('[data-filter]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    $$('#products .product-card').forEach((card) => {
      const c = card.dataset.category;
      card.hidden = !(f === 'all' || (f === 'web' ? c === 'web' : c !== 'web'));
    });
  }));

  // "Discuss a custom build" etc. preselect the product in the contact form
  $$('a[data-product]').forEach((a) => a.addEventListener('click', () => {
    const sel = $('#contact select[name="product"]');
    if (sel) sel.value = a.dataset.product;
  }));

  // ----- inquiry forms -----
  $$('[data-lead-form]').forEach((form) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('.form-status', form);
    const data = Object.fromEntries(new FormData(form));
    status.className = 'form-status';
    if (!data.name.trim() || !/^\S+@\S+\.\S+$/.test(data.email) || !data.message.trim()) {
      status.textContent = 'Please fill in your name, a valid email and a message.';
      status.classList.add('err');
      return;
    }
    const btn = $('button[type="submit"]', form);
    btn.disabled = true;
    status.textContent = 'Sending…';
    try {
      await postJson('/api/inquiries', { ...data, source: 'form' });
      const done = document.createElement('div');
      done.className = 'form-done';
      done.innerHTML = '<div class="big">✅</div><h3>Message sent</h3><p class="muted">Thanks! We have emailed you a confirmation and will reply soon.</p>';
      form.append(done);
      form.classList.add('sent');
    } catch (err) {
      status.textContent = err.message;
      status.classList.add('err');
    } finally {
      btn.disabled = false;
    }
  }));

  // ----- live demo (iframe) -----
  $$('[data-live]').forEach((stage) => {
    const frame = $('.live-frame', stage);
    const iframe = $('iframe', stage);
    iframe.addEventListener('load', () => frame.classList.add('loaded'));
    setTimeout(() => frame.classList.add('loaded'), 45000);
    $$('[data-device]').forEach((b) => b.tagName === 'BUTTON' && b.addEventListener('click', () => {
      stage.dataset.device = b.dataset.device;
      $$('button[data-device]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    }));
  });

  // ----- screen tour -----
  $$('[data-tour]').forEach((tour) => {
    const slides = $$('.tour-slide', tour);
    const thumbs = $$('.tour-thumbs button', tour);
    const cap = $('.tour-caption', tour);
    let i = 0;
    const show = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, k) => { s.hidden = k !== i; });
      thumbs.forEach((t, k) => t.setAttribute('aria-current', String(k === i)));
      cap.querySelector('b').textContent = `${i + 1} / ${slides.length}`;
      cap.querySelector('span').textContent = thumbs[i]?.dataset.caption || '';
      thumbs[i]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    };
    $('.prev', tour).addEventListener('click', () => show(i - 1));
    $('.next', tour).addEventListener('click', () => show(i + 1));
    thumbs.forEach((t) => t.addEventListener('click', () => show(Number(t.dataset.i))));
    document.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === 'ArrowLeft') show(i - 1);
      if (e.key === 'ArrowRight') show(i + 1);
    });
    const m = location.hash.match(/^#shot-(\d+)$/);
    if (m) { show(Number(m[1])); tour.scrollIntoView(); }
  });

  // ----- chat assistant -----
  const chat = $('[data-chat]');
  if (!chat) return;
  const panel = $('.chat-panel', chat);
  const log = $('.chat-log', chat);
  const toggle = $('.chat-toggle', chat);
  const input = $('.chat-input input', chat);
  const transcript = [];
  let started = false;
  let lastProduct = '';

  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const bubble = (text, who) => {
    const el = document.createElement('div');
    el.className = `msg ${who}`;
    el.textContent = text;
    log.append(el);
    transcript.push(`${who === 'me' ? 'Visitor' : 'Bot'}: ${text}`);
    scroll();
    return el;
  };
  const extras = ({ links = [], chips = [] }) => {
    if (!links.length && !chips.length) return;
    const box = document.createElement('div');
    box.className = 'msg-extras';
    links.forEach((l) => { const a = document.createElement('a'); a.href = l.href; a.textContent = l.label; box.append(a); });
    chips.forEach((c) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.onclick = () => ask(c); box.append(b); });
    log.append(box);
    scroll();
  };

  const leadForm = (product) => {
    const f = document.createElement('form');
    f.className = 'chat-lead';
    f.innerHTML = `<input name="name" placeholder="Your name" maxlength="100" required aria-label="Your name">
      <input name="email" type="email" placeholder="Email" maxlength="200" required aria-label="Email">
      <input name="phone" placeholder="Phone (optional)" maxlength="40" aria-label="Phone">
      <textarea name="message" placeholder="What do you need?" maxlength="2000" aria-label="Message"></textarea>
      <button class="btn btn-primary btn-sm" type="submit">Send to the team</button>`;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      if (!d.name.trim() || !/^\S+@\S+\.\S+$/.test(d.email)) { bubble('Please add your name and a valid email.', 'bot'); return; }
      const btn = f.querySelector('button');
      btn.disabled = true;
      try {
        const message = `${d.message.trim() || '(no message)'}\n\n— Chat transcript —\n${transcript.slice(-16).join('\n')}`;
        await postJson('/api/inquiries', { name: d.name, email: d.email, phone: d.phone, product, message, source: 'chat' });
        f.remove();
        bubble(`Thanks ${d.name.split(' ')[0]}! The team has your message and will reply to ${d.email}. 📬`, 'bot');
      } catch (err) {
        btn.disabled = false;
        bubble(err.message, 'bot');
      }
    });
    log.append(f);
    scroll();
    f.querySelector('input').focus();
  };

  async function ask(text) {
    text = String(text).trim();
    if (!text) return;
    bubble(text, 'me');
    const typing = document.createElement('div');
    typing.className = 'msg bot';
    typing.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    log.append(typing);
    scroll();
    try {
      const r = await postJson('/api/chat', { message: text });
      typing.remove();
      bubble(r.reply, 'bot');
      if (r.product) lastProduct = r.product;
      extras(r);
      if (r.lead) leadForm(r.product || lastProduct);
    } catch (err) {
      typing.remove();
      bubble(err.message, 'bot');
    }
  }

  const open = (state) => {
    panel.hidden = !state;
    toggle.setAttribute('aria-expanded', String(state));
    if (state && !started) {
      started = true;
      bubble(chat.dataset.greeting, 'bot');
      extras({ chips: ['Web apps', 'Mobile & devices', 'Pricing', 'Demos', 'Talk to the team'] });
    }
    if (state) setTimeout(() => input.focus(), 50);
  };
  toggle.addEventListener('click', () => open(panel.hidden));
  $('.chat-close', chat).addEventListener('click', () => open(false));
  $$('[data-open-chat]').forEach((b) => b.addEventListener('click', () => open(true)));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) open(false); });
  $('.chat-input', chat).addEventListener('submit', (e) => { e.preventDefault(); const v = input.value; input.value = ''; ask(v); });
})();
