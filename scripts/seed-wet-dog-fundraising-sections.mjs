#!/usr/bin/env node
/**
 * Split wet-dog competition layouts into 4 standalone section templates,
 * write to cms/templates/sections/fundraising/*, upload to R2 CMS_BUCKET (`cms`),
 * apply migration 855 to D1.
 */
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const CONFIG = path.join(REPO, 'wrangler.production.toml');
const BUCKET = process.env.IAM_CMS_R2_BUCKET || 'cms';
const OLD_ASSETS_BUCKET = 'inneranimalmedia';
const OLD_KEY_PREFIX = 'static/templates/sections/fundraising';

const SHARED_STYLE = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --brand: #1a3a2a;
    --brand-mid: #2d6a4f;
    --brand-light: #52b788;
    --accent: #f4a261;
    --accent-warm: #e76f51;
    --cream: #fdf8f0;
    --cream-dark: #f0e9d6;
    --ink: #1a1a18;
    --ink-mid: #3d3d3a;
    --ink-light: #6b6b67;
    --white: #ffffff;
    --radius-sm: 8px;
    --radius-md: 16px;
    --radius-lg: 24px;
    --radius-xl: 32px;
  }
  html { scroll-behavior: smooth; }
  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--cream);
    color: var(--ink);
    line-height: 1.6;
  }
  .section-block { padding: 5rem 2rem; }
  .section-label {
    font-size: 11px; font-weight: 600; letter-spacing: 0.12em;
    text-transform: uppercase; color: var(--brand-light); margin-bottom: 0.5rem;
  }
  .section-eyebrow {
    font-family: 'Playfair Display', serif;
    font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 900;
    line-height: 1.1; color: var(--brand); margin-bottom: 0.75rem;
  }
  .section-sub {
    font-size: 1rem; color: var(--ink-light); max-width: 560px;
    line-height: 1.7; margin-bottom: 2.5rem;
  }
  .container { max-width: 1100px; margin: 0 auto; }
  .entry-card {
    background: var(--white); border-radius: var(--radius-lg); overflow: hidden;
    cursor: pointer; transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.25s ease;
    position: relative; border: 1px solid rgba(0,0,0,0.06);
  }
  .entry-card:hover { transform: translateY(-6px); box-shadow: 0 20px 48px rgba(26,58,42,0.15); }
  .card-img { width: 100%; object-fit: cover; display: block; }
  .card-body { padding: 1.1rem 1.25rem 1.25rem; }
  .card-category {
    font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
    text-transform: uppercase; color: var(--brand-light); margin-bottom: 0.3rem;
  }
  .card-title {
    font-family: 'Playfair Display', serif; font-size: 1.1rem; font-weight: 700;
    color: var(--brand); margin-bottom: 0.35rem; line-height: 1.25;
  }
  .card-desc { font-size: 0.8rem; color: var(--ink-light); line-height: 1.5; margin-bottom: 1rem; }
  .card-cta {
    display: inline-flex; align-items: center; gap: 6px; background: var(--brand);
    color: var(--white); font-size: 12px; font-weight: 600; padding: 8px 16px;
    border-radius: 20px; border: none; cursor: pointer; transition: background 0.2s, transform 0.15s;
    width: 100%; justify-content: center; letter-spacing: 0.02em;
  }
  .card-cta:hover { background: var(--brand-mid); transform: scale(1.02); }
  .card-cta svg { width: 14px; height: 14px; flex-shrink: 0; }
  .price-badge {
    position: absolute; top: 12px; right: 12px; background: var(--accent);
    color: var(--white); font-size: 11px; font-weight: 700; padding: 4px 10px;
    border-radius: 20px; letter-spacing: 0.03em;
  }
  #layout-a .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
  #layout-a .card-img { height: 200px; }
  #layout-b .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
  #layout-b .card-img { height: 170px; }
  #layout-c .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; }
  #layout-c .card-img { height: 240px; }
  #layout-d .hero-row { display: grid; grid-template-columns: 1.65fr 1fr; gap: 1.25rem; margin-bottom: 1.25rem; }
  #layout-d .hero-row .card-img { height: 300px; }
  #layout-d .small-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1.25rem; }
  #layout-d .small-row .card-img { height: 160px; }
  #layout-d .hero-badge {
    position: absolute; top: 16px; left: 16px; background: var(--brand);
    color: var(--white); font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
    text-transform: uppercase; padding: 5px 12px; border-radius: 20px;
  }
  .modal-overlay {
    position: fixed; inset: 0; background: rgba(10,20,15,0.65); backdrop-filter: blur(6px);
    z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 1rem;
    opacity: 0; pointer-events: none; transition: opacity 0.25s ease;
  }
  .modal-overlay.open { opacity: 1; pointer-events: all; }
  .modal {
    background: var(--white); border-radius: var(--radius-xl); width: 100%; max-width: 460px;
    overflow: hidden; transform: translateY(20px) scale(0.97);
    transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1); position: relative;
  }
  .modal-overlay.open .modal { transform: translateY(0) scale(1); }
  .modal-hero { height: 160px; position: relative; overflow: hidden; }
  .modal-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .modal-hero-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, rgba(26,58,42,0.2), rgba(26,58,42,0.75));
    display: flex; flex-direction: column; justify-content: flex-end; padding: 1.25rem 1.5rem;
  }
  .modal-hero-cat { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--brand-light); margin-bottom: 0.2rem; }
  .modal-hero-title { font-family: 'Playfair Display', serif; font-size: 1.4rem; font-weight: 900; color: var(--white); line-height: 1.2; }
  .modal-close {
    position: absolute; top: 12px; right: 12px; width: 30px; height: 30px;
    background: rgba(255,255,255,0.2); backdrop-filter: blur(4px); border: none; border-radius: 50%;
    color: white; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;
  }
  .modal-body { padding: 1.5rem; }
  .modal-price-row {
    display: flex; align-items: center; justify-content: space-between;
    background: var(--cream); border-radius: var(--radius-sm); padding: 0.75rem 1rem; margin-bottom: 1.25rem;
  }
  .modal-price-label { font-size: 13px; color: var(--ink-light); }
  .modal-price-val { font-family: 'Playfair Display', serif; font-size: 1.5rem; font-weight: 700; color: var(--brand); }
  .form-row { margin-bottom: 0.85rem; }
  .form-row label {
    display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.06em;
    text-transform: uppercase; color: var(--ink-mid); margin-bottom: 0.3rem;
  }
  .form-row input, .form-row select {
    width: 100%; padding: 10px 14px; border: 1.5px solid #e0dbd0; border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif; font-size: 14px; color: var(--ink); background: var(--white); outline: none;
  }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
  .upload-zone {
    border: 2px dashed #cfc9b8; border-radius: var(--radius-md); padding: 1.5rem; text-align: center;
    cursor: pointer; margin-bottom: 1.25rem;
  }
  .upload-icon { width: 36px; height: 36px; margin: 0 auto 0.5rem; color: var(--ink-light); }
  .upload-text { font-size: 13px; color: var(--ink-light); }
  .stripe-btn {
    width: 100%; padding: 14px; background: var(--brand); color: var(--white);
    font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600; border: none;
    border-radius: var(--radius-md); cursor: pointer; display: flex; align-items: center;
    justify-content: center; gap: 8px;
  }
  .stripe-lock { display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 0.75rem; font-size: 11px; color: var(--ink-light); }
  @media (max-width: 768px) {
    #layout-a .grid { grid-template-columns: 1fr; }
    #layout-b .grid { grid-template-columns: repeat(2, 1fr); }
    #layout-c .grid { grid-template-columns: 1fr; }
    #layout-d .hero-row { grid-template-columns: 1fr; }
    #layout-d .small-row { grid-template-columns: repeat(2, 1fr); }
    .section-block { padding: 3rem 1.25rem; }
    .form-grid { grid-template-columns: 1fr; }
  }
`;

const MODAL_AND_SCRIPT = `
<div class="modal-overlay" id="entryModal" onclick="closeModal(event)">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-hero">
      <img id="modal-img" src="" alt="">
      <div class="modal-hero-overlay">
        <div class="modal-hero-cat" id="modal-cat"></div>
        <div class="modal-hero-title" id="modal-title"></div>
      </div>
      <button class="modal-close" onclick="closeModal()" aria-label="Close">✕</button>
    </div>
    <div class="modal-body">
      <div class="modal-price-row">
        <span class="modal-price-label">Competition entry fee</span>
        <span class="modal-price-val">$10.00</span>
      </div>
      <div class="form-grid">
        <div class="form-row"><label for="owner-name">Your name</label><input type="text" id="owner-name" placeholder="Jane Smith"></div>
        <div class="form-row"><label for="dog-name">Dog's name</label><input type="text" id="dog-name" placeholder="Biscuit"></div>
      </div>
      <div class="form-row"><label for="owner-email">Email address</label><input type="email" id="owner-email" placeholder="jane@email.com"></div>
      <div class="upload-zone" onclick="document.getElementById('photo-input').click()">
        <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
        <div class="upload-text"><strong>Click to upload</strong> your photo</div>
        <input type="file" id="photo-input" accept="image/jpeg,image/png" style="display:none" onchange="handleFileSelect(event)">
      </div>
      <button class="stripe-btn" onclick="handleSubmit()">Pay $10 and submit entry</button>
      <div class="stripe-lock">Secured by Stripe — your card is never stored</div>
    </div>
  </div>
</div>
<script>
let currentCategory = '';
function openModal(slug, title, desc, imgSrc) {
  currentCategory = slug;
  document.getElementById('modal-img').src = imgSrc;
  document.getElementById('modal-cat').textContent = desc;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('entryModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(e) {
  if (!e || e.target === document.getElementById('entryModal') || (e.target && e.target.classList && e.target.classList.contains('modal-close'))) {
    document.getElementById('entryModal').classList.remove('open');
    document.body.style.overflow = '';
  }
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal({ target: document.getElementById('entryModal') }); });
function handleFileSelect(e) {
  const file = e.target.files[0]; if (!file) return;
  const zone = e.target.closest('.upload-zone');
  zone.querySelector('.upload-text').innerHTML = '<strong>' + file.name + '</strong>';
}
function handleSubmit() {
  const name = document.getElementById('owner-name').value.trim();
  const email = document.getElementById('owner-email').value.trim();
  const dog = document.getElementById('dog-name').value.trim();
  const file = document.getElementById('photo-input').files[0];
  if (!name || !email || !dog) { alert("Please fill in your name, email, and dog's name."); return; }
  if (!file) { alert('Please upload a photo of your dog.'); return; }
  alert('In production this would create a Stripe Checkout session for $10. Entry: ' + dog + ' (' + currentCategory + ') by ' + name);
}
</script>`;

const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

function card(slug, title, desc, img600, img800, cat, catNum, ctaLabel = 'Enter this category', price = '$10 entry') {
  const cta = ctaLabel === 'Enter' ? 'Enter' : `${STAR} ${ctaLabel}`;
  return `<div class="entry-card" onclick="openModal('${slug}','${title}','${desc.replace(/'/g, "\\'")}','${img800}')">
    <span class="price-badge">${price}</span>
    <img class="card-img" src="${img600}" alt="${title}" loading="lazy">
    <div class="card-body">
      <div class="card-category">${cat}</div>
      <div class="card-title">${title}</div>
      <div class="card-desc">${desc}</div>
      <button class="card-cta" onclick="event.stopPropagation(); openModal('${slug}','${title}','${desc.replace(/'/g, "\\'")}','${img800}')">${cta}</button>
    </div>
  </div>`;
}

const SECTIONS = {
  'wet-dog-3col': `<section class="section-block" id="layout-a"><div class="container">
    <div class="section-label">Layout A — 3 column</div>
    <h2 class="section-eyebrow">Enter the<br>competition</h2>
    <p class="section-sub">Pick your dog's best wet moment, pay the $10 entry fee, and let the community vote. All proceeds support shelter animals in the Caddo area.</p>
    <div class="grid">
      ${card('hometown','Hometown Hero','Local Shreveport, Bossier, and Caddo area pets only. Show the home crowd some love.','https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=600&q=80','https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80','Category 01','01')}
      ${card('soggy','Saddest Soggy Face','The pet who looks like they have experienced the ultimate betrayal — cleanliness.','https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=600&q=80','https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&q=80','Category 02','02')}
      ${card('mud','Mud Monster',"For the dogs who prefer nature's bath. Fully caked, zero regrets.",'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=600&q=80','https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=800&q=80','Category 03','03')}
    </div></div></section>`,

  'wet-dog-4col': `<section class="section-block" id="layout-b"><div class="container">
    <div class="section-label">Layout B — 4 column</div>
    <h2 class="section-eyebrow">Pick your<br>dog's lane</h2>
    <p class="section-sub">Four categories, one winner each. $10 entry, all funds go directly to animals in need.</p>
    <div class="grid">
      ${card('hometown','Hometown Hero','Local Caddo area pets only.','https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400&q=80','https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80','01','01','Enter','$10')}
      ${card('soggy','Saddest Soggy Face','Ultimate betrayal expression.','https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=400&q=80','https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&q=80','02','02','Enter','$10')}
      ${card('shake','Majestic Shake Off','Action shots with flying droplets.','https://images.unsplash.com/photo-1601758174493-db7b54b53c56?w=400&q=80','https://images.unsplash.com/photo-1601758174493-db7b54b53c56?w=800&q=80','03','03','Enter','$10')}
      ${card('mud','Mud Monster','Fully caked, zero regrets.','https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=400&q=80','https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=800&q=80','04','04','Enter','$10')}
    </div></div></section>`,

  'wet-dog-2x2': `<section class="section-block" id="layout-c"><div class="container">
    <div class="section-label">Layout C — 2×2 grid</div>
    <h2 class="section-eyebrow">Find your<br>category</h2>
    <p class="section-sub">More room per card — great once entries come in and you want to show vote counts or entry numbers on each lane.</p>
    <div class="grid">
      ${card('hometown','Hometown Hero','Calling all local pets in the Shreveport, Bossier, Caddo area. Send in your favorite photo to win the hometown crown.','https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=700&q=80','https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80','Category 01','01','Enter this category — $10')}
      ${card('soggy','Saddest Soggy Face','The pet who looks like they have experienced the ultimate betrayal — cleanliness. Bonus points for dramatic side-eye.','https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=700&q=80','https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&q=80','Category 02','02','Enter this category — $10')}
      ${card('shake','Majestic Shake Off','Action shots catching the flying water droplets in all their glory — goofy faces and all. Motion blur welcome.','https://images.unsplash.com/photo-1601758174493-db7b54b53c56?w=700&q=80','https://images.unsplash.com/photo-1601758174493-db7b54b53c56?w=800&q=80','Category 03','03','Enter this category — $10')}
      ${card('mud','Mud Monster',"For the dogs who prefer nature's bath. Fully caked, completely unbothered. The muddier the better.",'https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=700&q=80','https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=800&q=80','Category 04','04','Enter this category — $10')}
    </div></div></section>`,

  'wet-dog-hero3': `<section class="section-block" id="layout-d"><div class="container">
    <div class="section-label">Layout D — Hero + 3</div>
    <h2 class="section-eyebrow">Shake off the<br>mundane</h2>
    <p class="section-sub">Lead with the local angle. Hometown Hero gets the feature slot — the other three categories sit below as supporting lanes.</p>
    <div class="hero-row">
      <div class="entry-card" onclick="openModal('hometown','Hometown Hero','Your pup repping the Shreveport-Bossier-Caddo area.','https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80')">
        <span class="hero-badge">Featured category</span><span class="price-badge">$10 entry</span>
        <img class="card-img" src="https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=900&q=80" alt="Happy wet dog" loading="lazy">
        <div class="card-body"><div class="card-category">Category 01 — Featured</div><div class="card-title">Hometown Hero</div>
        <div class="card-desc">Calling all local pets in the Shreveport, Bossier, Caddo area. Send in your favorite soggy photo to win the hometown crown.</div>
        <button class="card-cta" onclick="event.stopPropagation(); openModal('hometown','Hometown Hero','Your pup repping the Shreveport-Bossier-Caddo area.','https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=800&q=80')">${STAR} Enter Hometown Hero</button></div>
      </div>
      ${card('soggy','Saddest Soggy Face','Ultimate betrayal — the bath time face.','https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=500&q=80','https://images.unsplash.com/photo-1548199973-03cce0bbc87b?w=800&q=80','Category 02','02','Enter','$10')}
    </div>
    <div class="small-row">
      ${card('shake','Majestic Shake Off','Action shots, water flying.','https://images.unsplash.com/photo-1601758174493-db7b54b53c56?w=400&q=80','https://images.unsplash.com/photo-1601758174493-db7b54b53c56?w=800&q=80','Category 03','03','Enter','$10')}
      ${card('mud','Mud Monster','Fully caked, zero regrets.','https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=400&q=80','https://images.unsplash.com/photo-1530281700549-e82e7bf110d6?w=800&q=80','Category 04','04','Enter','$10')}
      <div class="entry-card" style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:2rem 1.25rem;background:var(--brand);cursor:default;">
        <div style="font-family:'Playfair Display',serif;font-size:1.5rem;font-weight:900;color:var(--white);margin-bottom:0.5rem;">$10</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.7);line-height:1.5;margin-bottom:1rem;">One entry per dog. All proceeds support Companions of CPAS shelter animals.</div>
        <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--brand-light);">Stripe secure checkout</div>
      </div>
    </div></div></section>`,
};

const R2_KEYS = {
  'wet-dog-3col': 'templates/sections/fundraising/wet-dog-3col/index.html',
  'wet-dog-4col': 'templates/sections/fundraising/wet-dog-4col/index.html',
  'wet-dog-2x2': 'templates/sections/fundraising/wet-dog-2x2/index.html',
  'wet-dog-hero3': 'templates/sections/fundraising/wet-dog-hero3/index.html',
};

function wrapSection(sectionHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wet Dog Competition Section</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>${SHARED_STYLE}</style>
</head>
<body>
${sectionHtml}
${MODAL_AND_SCRIPT}
</body>
</html>`;
}

function putR2(key, file) {
  const args = [
    'npx', 'wrangler', 'r2', 'object', 'put',
    `${BUCKET}/${key}`,
    '--file', file,
    '--content-type', 'text/html; charset=utf-8',
    '--config', CONFIG,
    '--remote',
  ];
  console.log('→', './scripts/with-cloudflare-env.sh', args.join(' '));
  const result = spawnSync('./scripts/with-cloudflare-env.sh', args, { cwd: REPO, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function deleteOldAssetsKey(key) {
  const args = [
    'npx', 'wrangler', 'r2', 'object', 'delete',
    `${OLD_ASSETS_BUCKET}/${key}`,
    '--config', CONFIG,
    '--remote',
  ];
  console.log('→ delete misplaced', `${OLD_ASSETS_BUCKET}/${key}`);
  spawnSync('./scripts/with-cloudflare-env.sh', args, { cwd: REPO, stdio: 'inherit' });
}

const written = [];
for (const [slug, sectionHtml] of Object.entries(SECTIONS)) {
  const outDir = path.join(REPO, 'cms/templates/sections/fundraising', slug);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'index.html');
  fs.writeFileSync(outFile, wrapSection(sectionHtml), 'utf8');
  written.push({ slug, outFile, key: R2_KEYS[slug] });
}

for (const { outFile, key, slug } of written) {
  putR2(key, outFile);
  deleteOldAssetsKey(`${OLD_KEY_PREFIX}/${slug}/index.html`);
}

const migration = path.join(REPO, 'migrations/855_wet_dog_fundraising_section_templates.sql');
execSync(
  `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=${migration}`,
  { cwd: REPO, stdio: 'inherit' },
);

const verify = execSync(
  `./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --command "SELECT id, template_name, source_html_r2_key, sort_order FROM cms_component_templates WHERE id LIKE 'tpl_wetdog_%' ORDER BY sort_order;"`,
  { cwd: REPO, encoding: 'utf8' },
);
console.log(verify);
console.log('Done — 4 wet-dog section templates on CMS_BUCKET (cms) and registered.');
