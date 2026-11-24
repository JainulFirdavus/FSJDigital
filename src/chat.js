// Rule-based sales assistant. No AI service or API cost: it answers from the product
// data in the CMS and hands off to a lead form when the visitor wants a person.
import { categoryLabel } from './util.js';

const norm = (s) => ` ${String(s).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()} `;
const has = (t, words) => words.some((w) => t.includes(` ${w} `) || (w.includes(' ') && t.includes(w)));

const productLinks = (p) => [
  { label: `${p.name} details`, href: `/products/${p.slug}` },
  { label: p.demo?.type === 'live' ? 'Open live demo' : 'View demo', href: `/demo/${p.slug}` },
];

function matchProducts(t, products) {
  return products.filter((p) => {
    const terms = [p.name, p.slug.replace(/-/g, ' '), ...(p.keywords || [])].map((x) => x.toLowerCase());
    return terms.some((k) => k && (t.includes(` ${k} `) || (k.length > 4 && t.includes(k))));
  });
}

const priceLine = (p) => (p.price ? `${p.name} starts at ${p.price}${p.priceNote ? ` (${p.priceNote})` : ''}.` : `${p.name} is priced per project${p.priceNote ? ` — ${p.priceNote.toLowerCase()}` : ''}.`);

export function chatReply(message, products, site) {
  const t = norm(message);
  const found = matchProducts(t, products);
  const chips = products.slice(0, 6).map((p) => p.name);
  const wantsPrice = has(t, ['price', 'prices', 'pricing', 'cost', 'costs', 'how much', 'rate', 'fee', 'fees', 'budget', 'harga', 'quote']);
  const wantsDemo = has(t, ['demo', 'demos', 'try', 'trial', 'preview', 'screenshots', 'video', 'see it', 'test']);
  const wantsHuman = has(t, ['human', 'person', 'agent', 'talk', 'call', 'contact', 'sales', 'buy', 'purchase', 'order', 'meeting', 'whatsapp', 'email you', 'quote']);

  if (found.length === 1) {
    const p = found[0];
    if (wantsPrice) return { reply: `${priceLine(p)} Pricing depends on branding, hosting and any custom features. Leave your details and we'll send an exact quote.`, links: productLinks(p), lead: true, product: p.name };
    if (wantsDemo) return { reply: p.demo?.type === 'live' ? `${p.name} has a live demo you can click through right now.` : `Here's a guided screen tour of ${p.name}. We can also book a live walkthrough for you.`, links: productLinks(p), chips: ['Pricing', 'Talk to the team'], product: p.name };
    const top = (p.features || []).slice(0, 4).map((x) => `• ${x.title}`).join('\n');
    return { reply: `${p.name} — ${p.tagline}\n\n${top}`, links: productLinks(p), chips: [`${p.name} pricing`, 'Talk to the team'], product: p.name };
  }
  if (found.length > 1 && !wantsHuman) {
    return { reply: `These match what you asked:\n${found.map((p) => `• ${p.name} — ${p.tagline}`).join('\n')}`, links: found.flatMap((p) => [{ label: p.name, href: `/products/${p.slug}` }]), chips: found.map((p) => p.name) };
  }
  if (wantsHuman) return { reply: 'Happy to connect you with the team. Share your name and email and we will reply by email.', lead: true };
  if (has(t, ['hi', 'hello', 'hey', 'salam', 'assalamualaikum', 'good morning', 'good evening'])) return { reply: site.chatGreeting, chips };
  if (wantsPrice) {
    const lines = products.map((p) => `• ${p.price ? `${p.name}: from ${p.price}` : `${p.name}: custom quote`}`).join('\n');
    return { reply: `${lines}\n\nEvery package includes your branding and setup. Want an exact quote?`, lead: true };
  }
  if (wantsDemo) return { reply: 'Every product has a demo page:', links: products.map((p) => ({ label: p.name, href: `/demo/${p.slug}` })) };
  if (has(t, ['web', 'website', 'browser', 'online'])) {
    const list = products.filter((p) => p.category === 'web');
    return { reply: `Our web products:\n${list.map((p) => `• ${p.name} — ${p.tagline}`).join('\n')}`, chips: list.map((p) => p.name) };
  }
  if (has(t, ['mobile', 'android', 'ios', 'phone', 'app', 'apps', 'device', 'hardware', 'gadget'])) {
    const list = products.filter((p) => p.category !== 'web');
    return { reply: `Mobile & devices:\n${list.map((p) => `• ${p.name} (${categoryLabel[p.category]}) — ${p.tagline}`).join('\n')}`, chips: list.map((p) => p.name) };
  }
  if (has(t, ['custom', 'customise', 'customize', 'build', 'develop', 'feature', 'features', 'modify', 'change', 'new app'])) {
    return { reply: 'Yes — we customise every product and also build new apps. Tell us what you need and we will reply with a plan and quote.', lead: true };
  }
  if (has(t, ['host', 'hosting', 'server', 'domain', 'install', 'setup', 'set up', 'deploy', 'support', 'maintenance', 'update', 'updates'])) {
    const faq = (site.faq || []).find((x) => /host|setup|launch|support/i.test(x.q));
    return { reply: faq ? faq.a : 'We handle setup, hosting and updates for you.', chips: ['Talk to the team', 'Pricing'] };
  }
  if (has(t, ['thanks', 'thank you', 'ok', 'okay', 'great', 'cool'])) return { reply: 'You are welcome! Anything else I can help with?', chips: ['Pricing', 'Demos', 'Talk to the team'] };
  return { reply: "I'm not sure I got that. I can tell you about a product, show demos, or pass your question to the team.", chips: [...chips.slice(0, 4), 'Talk to the team'] };
}
