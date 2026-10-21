# ClearNote Sheets

The store at **clearnotesheets.com**: the newest Jewish music as sheet music within 24–72 hours of release.

- Plain HTML, CSS and JavaScript with no build step
- Catalog and admin login in **Supabase**
- Checkout, cart and PDF delivery by **Payhip**
- Hosted on **Cloudflare Pages**, and it also runs on GitHub Pages for testing

Until Supabase is connected, the site shows a demo catalog.

## For the store owner: adding a song

Everything happens in two websites, with no code:

1. **Payhip:** add a new digital product, upload the PDF, set the price and save. Then open **Share / Embed** and copy the product link.
2. **clearnotesheets.com/admin:** sign in and tap **Add a sheet**. The form walks you through the rest:
   - Paste the Payhip link.
   - Fill in the title, artist, key, BPM and time signature.
   - Add the cover and a preview of the first page from your photos. Big phone photos are resized automatically.
   - Tap **Publish sheet**. The song is in the store right away.

To change a song, tap it in the list, edit, and tap **Save changes**. To take one down, turn off **Published** or tap **Delete sheet**. The Payhip product isn't touched either way.

The admin works well on a phone. Open it in Safari or Chrome and choose **Add to Home Screen**, and it gets its own app icon. It stays signed in.

## What's where

```
index.html     Home: 24–72 hour bar, hero, browse tiles, new releases, recently added, features, banner
browse.html    Full catalog: search, sort, A–Z, artists (?by=artist), albums (?by=album), new releases (?new=1)
song.html      Song page (?s=song-slug): preview, key, BPM, time signature, price, Buy now and Add to cart
admin.html     Store admin at /admin
about.html     About page (starter text, edit freely)
faq.html       Frequently asked questions
404.html       Not-found page

css/   tokens.css (colours, light and dark), glass.css (panels, buttons), site.css (store), admin.css
js/    config.js (your settings), payhip-config.js, catalog.js, ui.js, site.js, home.js, browse.js, song.js, admin.js

data/demo-catalog.json   Demo songs, shown until Supabase is connected
assets/brand/            Logo (crystal note, light and dark), hero, banner and browse-tile images
assets/demo/             Demo covers and sheet previews
supabase/schema.sql      Tables, security rules and the image bucket
admin.webmanifest, icon-192.png, icon-512.png   Home-screen app for the admin
_headers, robots.txt     Cloudflare headers; keeps the admin out of search engines
```

## How a sale works

- Customers tap **Buy now**, which goes straight to Payhip's checkout, or **Add to cart**, which opens Payhip's cart on the site.
- They pay by card, PayPal and so on. Payhip shows the download page and emails the PDF.
- **My purchases** sends them to Payhip. They sign in there with their checkout email to download again.

The light/dark choice (Auto, Light or Dark) sits at the bottom of every page and in the phone menu. Auto follows the device.

## One-time setup

### 1. Supabase

1. Create a project. Open **SQL Editor**, paste `supabase/schema.sql`, and run it.
2. Under **Authentication**:
   - Turn off new user sign-ups and keep **Confirm email** on.
   - Under **URL Configuration**, set the Site URL to `https://clearnotesheets.com` and add `https://clearnotesheets.com/admin` to the Redirect URLs.
3. Go to **Authentication > Users > Add user** and add the store owner's email with a password.
4. Go to **Table Editor > admins > Insert row** and type the same email. Only emails in this table can manage the store.
5. For sign-in links by email, connect Resend as the custom SMTP under **Authentication > Emails**. Supabase's built-in email only reaches your own team, so until then the owner signs in with the password.
6. Under **Project Settings > API Keys**, copy the Project URL and the **publishable** key into `js/config.js`. Never use a secret or service_role key there.

### 2. Payhip

- Connect Stripe and/or PayPal in Payhip's payment settings.
- Keep each price the same in Payhip and the admin. Payhip charges its own price, and the site only displays it. Payhip has no way for the site to read prices; its API covers only coupons and license keys.

### 3. Cloudflare Pages and the domain

- Connect the GitHub repo (Kuna-Labs/ClearNoteSheets). Leave the build command empty and the output directory as `/`.
- Under **Custom domains**, add `clearnotesheets.com` and `www.clearnotesheets.com`. Then redirect www to the bare domain with a Cloudflare redirect rule.
- Push with git or GitHub Desktop so folders stay intact. The web uploader can drop them.
- For testing on GitHub Pages, go to Settings > Pages and deploy from the `main` branch, root folder. Add that address to Supabase's Redirect URLs too.

### 4. Settings in `js/config.js`

These are the currency and locale (USD / en-US by default), the footer contact email, the Payhip account link, and how long browsers cache the catalog (5 minutes).

## The design and logo

The look follows the approved mockup:

- **Logo:** the crystal note is cut straight from the mockup (`assets/brand/crystal-note.png`), with a version that glows on dark backgrounds (`crystal-note-dark.png`). The "ClearNote Sheets" wordmark and tagline are live Montserrat text, so they stay sharp at any size.
- **Images:** the hero, closing banner and browse tiles are also taken from the mockup, with the baked-in text removed so the page shows real text. Dark mode uses night versions of the hero and banner.
- **Type:** Montserrat Light for headlines and the wordmark, Medium for the letter-spaced capitals.

To swap any of these images, replace the file in `assets/brand/` with one of the same name.

## Good to know

- Published sheets load into the browser once, so search is instant. That's comfortable up to a few thousand sheets.
- R2 and Resend are ready for a "request a song" form later.
