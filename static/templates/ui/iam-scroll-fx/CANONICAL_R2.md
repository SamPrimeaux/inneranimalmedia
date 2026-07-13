# Canonical R2 location (Scroll FX)

**Live demo:**  
https://assets.inneranimalmedia.com/cms/motion/iam-scroll-fx-v1/index.html

**R2 prefix:** `cms/motion/iam-scroll-fx-v1/`  
**Bucket:** `inneranimalmedia`

| Key | Role |
|-----|------|
| `index.html` | Live scrollable showcase of all four primitives |
| `css/*` | Demo + primitive stylesheets (tokens, engine, mask-wipe, letter-stagger, progress) |
| `js/scroll-engine.js` | Core progress writer |
| `js/split-text.js` | Char/word split + IntersectionObserver |
| `js/demo.js` | Showcase wiring only |
| `components/*` | Drop-in copies with zero showcase dependencies |

**Repo mirror:** `static/templates/ui/iam-scroll-fx/` (`components/`, `demo/`)  
**Upload:** `scripts/upload-iam-scroll-fx.sh`  
**CMS catalog:** `cms_component_templates.id = tpl_iam_scroll_fx_v1`

Sibling motion lane: `cms/motion/iam-motion-system-v1/` (loading states labs — different primitives).
