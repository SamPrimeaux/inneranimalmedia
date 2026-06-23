/**
 * Server-side hydration for pages/work/index.html from cms_page_sections.
 * Portfolio gallery section with filterable project cards.
 */
import { cmsSection, indexCmsSections } from './cms-public-page.js';

const CF_HASH = 'g7wf09fCONpnidkRnR_5vw';
const PLACEHOLDER_IMG = `https://imagedelivery.net/${CF_HASH}/1b7ecfe9-550c-4ef7-966c-9e1972e29800/thumbnail`;

const DEFAULTS = {
  eyebrow: 'Portfolio',
  heading: 'Selected projects',
  cards: [],
};

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

function replaceText(html, id, value) {
  const safe = escHtml(value);
  const re = new RegExp(`(<[^>]+id="${id}"[^>]*>)([\\s\\S]*?)(</)`, 'i');
  if (re.test(html)) return html.replace(re, `$1${safe}$3`);
  return html;
}

function renderCard(card) {
  const slug = escAttr(card.slug || '');
  const href = escAttr(card.detail_route || (slug ? `/work/${slug}` : '#'));
  const category = escHtml(card.category || 'Sites');
  const title = escHtml(card.title || 'Project');
  const imageUrl = escAttr(card.image_url || PLACEHOLDER_IMG);
  const logoUrl = escAttr(card.logo_url || '');
  const accent = escAttr(card.accent_color || '#2f7bff');
  const excerpt = escHtml(card.excerpt || '');
  const tags = Array.isArray(card.tags) ? card.tags : [];

  const logoHtml = logoUrl
    ? `<img class="portfolio-card-logo" src="${logoUrl}" alt="" loading="lazy">`
    : `<span class="portfolio-card-logo-fallback">${title.slice(0, 2)}</span>`;

  const tagsHtml = tags.length
    ? `<div class="portfolio-card-tags">${tags.map((t) => `<span class="portfolio-tag">${escHtml(t)}</span>`).join('')}</div>`
    : '';

  return `
    <a class="portfolio-card" href="${href}" data-category="${category}" style="--card-accent:${accent}">
      <div class="portfolio-card-accent"></div>
      <div class="portfolio-card-category">${category}</div>
      <h3 class="portfolio-card-title">${title}</h3>
      <div class="portfolio-card-mockup">
        <img src="${imageUrl}" alt="${title}" loading="lazy">
      </div>
      <div class="portfolio-card-foot">
        ${logoHtml}
        ${excerpt ? `<p class="portfolio-card-excerpt">${excerpt}</p>` : ''}
      </div>
      ${tagsHtml}
    </a>`;
}

/**
 * @param {string} html
 * @param {Array<{section_type:string,section_name:string,section_data:object}>} sections
 */
export function hydrateWorkPageHtml(html, sections) {
  const { byType, byKey } = indexCmsSections(sections);
  const gallery = cmsSection(byKey, byType, 'portfolio_gallery', 'work_portfolio', DEFAULTS);
  const cards = Array.isArray(gallery.cards) ? gallery.cards : DEFAULTS.cards;

  let out = String(html);
  out = replaceText(out, 'cms-work-gallery-eyebrow', gallery.eyebrow || DEFAULTS.eyebrow);
  out = replaceText(out, 'cms-work-gallery-heading', gallery.heading || DEFAULTS.heading);

  const gridHtml = cards.map(renderCard).join('\n');
  out = out.replace(
    /(<div class="portfolio-grid" id="cms-work-gallery-grid"[^>]*>)[\s\S]*?(<\/div>)/,
    `$1\n${gridHtml}\n$2`,
  );

  return out;
}

export { DEFAULTS as WORK_CMS_DEFAULTS };
