avs-art
=======

Portfolio site of the painter Anastasia Statsenko — https://avs-art.github.io

Static site on GitHub Pages (deploy from `main`, root). No build step:
`index.html` + `assets/` render everything from `data/db.json`.
Russian is the primary language; `RU / EN` in the top-right corner switches
(also `?lang=en`).

Layout
------

```
index.html                  page shell
assets/css/style.css        all styles
assets/js/app.js            loads data/db.json and renders the page
assets/js/i18n.js           interface strings (ru / en) and language state
assets/js/rates.js          live RUB → USD rate for the English prices
assets/js/edit.js           edit mode, loaded only when "Edit" is pressed
assets/js/store-github.js   saves through the GitHub API (live site)
assets/js/edit-key.js       password → GitHub token (decrypts data/edit-key.json)
assets/js/store-local.js    saves through tools/dev-server.mjs (local checkout)
data/db.json                site text + paintings
data/paintings/, data/site/ images
tools/dev-server.mjs        local server with a write API
tools/make-edit-key.mjs     writes data/edit-key.json (used by deploy.sh)
deploy.sh                   set the edit password + publish
```

Editing on the live site
------------------------

Press **Редактировать / Edit** (top-left), enter the password. An *Edit* button
appears next to every painting and next to the bio, plus *Add painting* below
the list. Changes are collected locally; **Publish** commits `data/db.json` to
this repository and GitHub Pages redeploys in about a minute. Images are
downscaled in the browser (long edge ≤ 2400 px, WebP) and committed when picked.

Deploying and the edit password
-------------------------------

```
./deploy.sh              # set (or keep) the edit password, then commit + push
./deploy.sh --password   # only change the password
```

The first run asks for two things:

1. **A GitHub fine-grained token** — GitHub → Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → *Generate new token*.
   Resource owner `avs-art`; *Only select repositories* → `avs-art.github.io`;
   Repository permissions → **Contents: Read and write**, nothing else.
   (The organization must allow fine-grained tokens: Organization settings →
   Personal access tokens.)
2. **The edit password** (12+ characters) — what is typed into the site.

The script encrypts the token with the password (PBKDF2-SHA256, 600 000
rounds → AES-256-GCM) into `data/edit-key.json`. On the site, the browser
decrypts the token with the entered password and keeps it in memory only.
`data/edit-key.json` is public, so the password is the only thing protecting
the token — use a long one. The token can only write to this repository; to
cut off access at any time, delete the token on GitHub. When the token
expires the site says so; run `./deploy.sh --password` with a new token.

`deploy.sh` also pulls in edits that were published from the live site
before pushing, so local work and site edits do not overwrite each other.

Prices
------

`price` is stored in rubles. The Russian version shows ₽. The English version
converts with a live rate (cached for a day) and rounds to the nearest $100;
if no rate can be fetched, `site.usdRateFallback` is used. With **Show price**
off (`showPrice: false`) or a price of 0 the site shows "Price on request".
Sold works show no price.

Run locally
-----------

```
node tools/dev-server.mjs            # http://localhost:8000
node tools/dev-server.mjs --lan      # also reachable from a phone on the same network
```

Served this way, edit mode saves straight to the working tree instead of
GitHub. Its password comes from `EDIT_PASSWORD` or a git-ignored `.env.local`
(`EDIT_PASSWORD=...`); if unset, one is generated and printed on startup.

Data
----

`site`: `artistName`, `tagline`, `bio`, `contactNote` (each `{ ru, en }`),
`bioImage` (+ `bioImageWidth/Height`), `phone`, `email`, `instagram` (handle or
profile URL), `usdRateFallback`.

`paintings[]`: `slug`, `name {ru,en}`, `description {ru,en}`, `date`, `price`
(RUB), `showPrice`, `status` (`for_sale` | `sold` | `on_order`), `img`,
`width`, `height`, `order`. An empty `en` text falls back to `ru`.
