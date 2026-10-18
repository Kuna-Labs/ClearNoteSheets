# ClearNote Sheets

Static site (vanilla HTML/CSS/JS, no build step) on Cloudflare Pages, with one Pages Function
for the request form: files go to R2, requests go to Supabase, emails go out through Resend.

```
public/                  ← everything Pages serves
  index.html  404.html  _headers  favicon.svg  apple-touch-icon.png
  css/tokens.css         palette, light/dark themes, crystal note tones per surface
  css/glass.css          Liquid Glass component + buttons
  css/site.css           layout and sections
  js/theme.js            light/dark (follows the device until the visitor picks)
  js/crystal.js          injects the logo sprite, turns on refraction, hero tilt
  js/request-form.js     validates and posts the form to /api/request
  assets/logo/
    clearnote-note-sprite.svg   themeable logo used on the site
    clearnote-note-light.svg    standalone, for light backgrounds
    clearnote-note-dark.svg     standalone, for dark backgrounds
    clearnote-note-email.png    used in Resend emails
functions/api/request.js ← POST /api/request  (R2 + Supabase + Resend)
supabase/schema.sql      ← requests table, RLS on
tools/logo/gen.py        ← regenerates the logo files (python3 + numpy)
wrangler.toml            ← Pages config, R2 binding, non-secret vars
```

## The crystal note

The logo is real 3D geometry: a 57-facet round brilliant for the note head, an 8-sided crystal
stem and a ridged, faceted flag, lit and projected to SVG (134 facets plus dispersion and sparkle).
Every facet is partly transparent, so the note takes its color from whatever is behind it.

Use it anywhere on the site:

```html
<svg class="crystal" viewBox="0 0 200 240" aria-hidden="true"><use href="#cn-note"/></svg>
```

It follows the light/dark theme automatically. To lock it to a brand surface, put it inside an
element with `data-surface="ivory"`, `"mist"` or `"navy"`. Facet tones are the `--cn-*` variables in
`tokens.css`.

To change the cut, tilt or proportions, edit `tools/logo/gen.py` and run:

```
python3 tools/logo/gen.py /tmp/logo
```

then copy `sprite.svg` → `clearnote-note-sprite.svg` and the two `note-*.svg` files over the
standalone versions.

## Liquid Glass

`.glass` is the frosted panel with rim light and sheen; it works everywhere. Add `.glass--refract`
for the liquid bend of the background. That uses an SVG filter inside `backdrop-filter`, which only
Chromium renders, so `crystal.js` adds `html.can-refract` on Chromium and Safari/Firefox keep the
frosted look.

## Setup

1. **Supabase**: create a project, run `supabase/schema.sql` in the SQL editor. Copy the project
   URL and a secret key (Project Settings → API Keys). Legacy `service_role` keys also work.
2. **R2**: `npx wrangler r2 bucket create clearnote-uploads` (leave it private).
3. **Resend**: verify your sending domain and create an API key.
4. **wrangler.toml**: set `SITE_URL`, `FROM_EMAIL` (on the verified domain) and `NOTIFY_EMAIL`.
5. **GitHub → Cloudflare Pages**: push the repo, then Workers & Pages → Create → Pages → connect
   the repo. No build command; output directory `public` (also set in `wrangler.toml`).
6. **Secrets** (Pages project → Settings → Variables and Secrets, type Secret):
   `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`.

Local dev with the function and a local R2 simulation:

```
cp .dev.vars.example .dev.vars   # fill in keys
npx wrangler pages dev
```

### Large media

Keep the uploads bucket private. For heavy public assets (audio previews, sample PDFs, hero
imagery), make a second R2 bucket with a custom domain (e.g. `media.yourdomain.com`) and link to
those URLs directly.

## Placeholders to fill in

`[YOUR TURNAROUND]`, `[YOUR PRICING …]`, `[YOUR RESPONSE TIME]`, `[YOUR EMAIL]` in `index.html`,
and the three vars in `wrangler.toml`.
