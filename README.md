# Country Made In

A Chrome extension that tells you where a product on Amazon is made — and shows you
the evidence for the answer instead of asking you to trust a flag.

> **Status: early.** Origin detection works on product pages: the extension reads the
> page you are on, shows a badge beside the title and a panel with the evidence behind it.
> The wider search is not built yet, search-result tiles are not badged, and there is no
> Chrome Web Store listing — install from source.

## What it does

On a supported Amazon product page, the extension reads the page you are actually
looking at and shows a badge beside the product title. Clicking it opens a panel with
everything behind the answer:

- **A verdict with a kind.** "Made in", "brand from" and "ships from" are three
  different questions with three different answers. They are reported separately
  rather than collapsed into one flag.
- **Evidence, always.** Every claim carries its source, its confidence and a link you
  can check yourself. Where sources disagree, you see the disagreement.
- **No flag unless we mean it.** Weak evidence shows as "origin unknown" rather than a
  flag with a caveat buried in a tooltip. The evidence is still one click away.
- **A wider search, only if you ask.** Looking beyond the current page costs time and
  needs extra permissions, so it happens on a button press and never automatically.
  *(Not built yet.)*

## Honest limitations

Read these before trusting an answer:

- **Origin data on Amazon is seller-supplied.** It is frequently absent, sometimes
  stale, and occasionally wrong. The extension reports what the listing says; it
  cannot verify what the listing claims.
- **"Country of origin" is not one thing.** A product assembled in one country from
  components made in three others has no single honest answer. Where the listing is
  ambiguous, the extension says so rather than picking.
- **Absence of an answer is common and is not a failure.** Most listings simply do not
  state an origin. "Not stated" is a real result.
- **The same ASIN is a different product on different marketplaces.** Answers are
  scoped to the marketplace you are on and are not carried across.

## Supported marketplaces

`amazon.com` · `amazon.co.uk` · `amazon.ca` · `amazon.in` · `amazon.de` ·
`amazon.fr` · `amazon.it` · `amazon.es` · `amazon.co.jp`

## Install from source

Requires Node 22 (see `.nvmrc`).

```bash
npm ci
npm run build
```

Then load it in Chrome:

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the `dist/` directory.

On WSL, Chrome loses an unpacked extension whenever the `\\wsl.localhost\…` path
becomes unreadable. Build onto the Windows filesystem instead:

```bash
COUNTRY_MADE_IN_DIST=/mnt/c/Users/you/country-made-in npm run build
```

The build **empties** that directory, so the path is validated before anything is
written — it must be absolute, must not contain the repo, and must be either empty or
a previous build output.

## Development

```bash
npm run dev        # Vite dev server with HMR
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest
npm run format     # Prettier
```

Extraction and country resolution are pure functions tested against saved page
fixtures. That is deliberate: parsing correctness is the product, so it is the part
with real tests.

## Privacy

There is no backend and no analytics. Nothing is collected, and nothing leaves your
browser except the requests you explicitly trigger with the wider search.

## Independence

This is an independent implementation. It is not affiliated with, endorsed by, or
connected to Amazon, and it is not derived from any other origin-checking extension.

---

Built by [Bates Solutions Inc](https://bates-solutions.com). Licensed under the
[MIT License](LICENSE).
