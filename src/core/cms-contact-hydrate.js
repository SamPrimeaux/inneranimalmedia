/**
 * Server-side hydration for pages/contact/index.html from cms_page_sections.
 */

import { cmsSection, indexCmsSections } from './cms-public-page.js';

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(value) {
  return escHtml(value).replace(/'/g, '&#39;');
}

const DEFAULTS = {
  hero: {
    headline: 'Get Connected',
    glb_url:
      'https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/Kinetic_Symmetry_0831084700_generate%20(1).glb',
    glb_alt: 'Abstract form',
  },
  client: {
    title: 'Become a Client',
    copy: 'Websites, platforms, dashboards, AI tools, automation, and custom digital systems.',
    email: 'hey@inneranimalmedia.com',
    cta_label: 'Start a Project',
    cta_href: 'mailto:hey@inneranimalmedia.com',
  },
  join: {
    title: 'Join Us',
    copy: 'Designers, developers, creators, operators, and collaborators interested in building with IAM.',
    cta_label: 'See Opportunities',
    cta_href: '/work',
  },
  collaborate: {
    title: 'Build with us.',
    copy: 'We partner with people who care about craft, systems, and long-term product quality.',
    cta_label: 'See Opportunities',
    cta_href: '/work',
  },
};

/**
 * @param {string} html
 * @param {Array<{section_type:string,section_name:string,section_data:object}>} sections
 */
export function hydrateContactPageHtml(html, sections) {
  const { byType, byKey } = indexCmsSections(sections);
  const hero = cmsSection(byKey, byType, 'hero', 'contact_hero', DEFAULTS.hero);
  const client = cmsSection(byKey, byType, 'contact_path', 'client', DEFAULTS.client);
  const join = cmsSection(byKey, byType, 'contact_path', 'join', DEFAULTS.join);
  const collaborate = cmsSection(byKey, byType, 'collaborate', 'build_with_us', DEFAULTS.collaborate);

  const glbUrl = String(hero.glb_url || DEFAULTS.hero.glb_url).trim();
  const glbHidden = hero.glb_enabled === false || !glbUrl;

  let out = String(html);
  const pairs = [
    ['cms-hero-headline', hero.headline || DEFAULTS.hero.headline],
    ['cms-client-title', client.title],
    ['cms-client-copy', client.copy],
    ['cms-client-cta-label', client.cta_label],
    ['cms-join-title', join.title],
    ['cms-join-copy', join.copy],
    ['cms-join-cta-label', join.cta_label],
    ['cms-build-title', collaborate.title],
    ['cms-build-copy', collaborate.copy],
    ['cms-build-cta-label', collaborate.cta_label],
  ];

  for (const [id, text] of pairs) {
    const re = new RegExp(`(<[^>]+id="${id}"[^>]*>)([\\s\\S]*?)(</)`, 'm');
    out = out.replace(re, `$1${escHtml(text)}$3`);
  }

  out = out.replace(
    /id="cms-client-cta"([^>]*)href="[^"]*"/,
    `id="cms-client-cta"$1href="${escAttr(client.cta_href || DEFAULTS.client.cta_href)}"`,
  );
  out = out.replace(
    /id="cms-client-email-link"([^>]*)href="[^"]*"/,
    `id="cms-client-email-link"$1href="mailto:${escAttr(client.email || DEFAULTS.client.email)}"`,
  );
  out = out.replace(
    /(<a class="path-email" id="cms-client-email-link"[^>]*>)([^<]*)(<\/a>)/,
    `$1${escHtml(client.email || DEFAULTS.client.email)}$3`,
  );
  out = out.replace(
    /id="cms-join-cta"([^>]*)href="[^"]*"/,
    `id="cms-join-cta"$1href="${escAttr(join.cta_href || DEFAULTS.join.cta_href)}"`,
  );
  out = out.replace(
    /id="cms-build-cta"([^>]*)href="[^"]*"/,
    `id="cms-build-cta"$1href="${escAttr(collaborate.cta_href || DEFAULTS.collaborate.cta_href)}"`,
  );

  if (glbHidden) {
    out = out.replace(
      /<div class="contact-hero-visual"[\s\S]*?<\/div>\s*(?=<\/section>)/,
      '<div class="contact-hero-visual contact-hero-visual--empty" aria-hidden="true"></div>\n    ',
    );
  } else {
    out = out.replace(/id="cms-hero-glb"([^>]*)src="[^"]*"/, `id="cms-hero-glb"$1src="${escAttr(glbUrl)}"`);
    out = out.replace(
      /id="cms-hero-glb"([^>]*)alt="[^"]*"/,
      `id="cms-hero-glb"$1alt="${escAttr(hero.glb_alt || DEFAULTS.hero.glb_alt)}"`,
    );
  }

  return out;
}
