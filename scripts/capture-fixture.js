/**
 * Fixture capture — paste this whole file into the DevTools console on an Amazon
 * product page (the ones with /dp/<ASIN> in the URL).
 *
 * It trims the page to the sections that can carry origin data, downloads it named
 * `<marketplace>__<asin>.html`, and prints every label/value pair it can see.
 *
 * It deliberately does NOT decide which pair is the origin. The expected value for a
 * fixture is what a human reads off the rendered page; if a script derived it with the
 * same selectors the extractor uses, the corpus would be testing the extractor against
 * its own output and would pass while being wrong.
 *
 * Chrome blocks pasting into the console until you type `allow pasting` once.
 */
;(() => {
  const MARKETPLACES = [
    'amazon.com',
    'amazon.co.uk',
    'amazon.ca',
    'amazon.in',
    'amazon.de',
    'amazon.fr',
    'amazon.it',
    'amazon.es',
    'amazon.co.jp',
  ]

  const host = location.hostname.toLowerCase()
  const marketplace = MARKETPLACES.find((d) => host === d || host.endsWith(`.${d}`))
  const asin =
    location.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1] ??
    document.querySelector('[data-asin]')?.getAttribute('data-asin') ??
    null

  if (!marketplace) return console.error('Not a supported Amazon marketplace:', host)
  if (!asin) return console.error('No ASIN in the URL — is this a product detail page?')

  // Generous on purpose: layouts vary between marketplaces and categories, and a
  // selector tight enough to be elegant is tight enough to miss the awkward pages.
  const SELECTORS = [
    '#productTitle',
    '#feature-bullets',
    '#productOverview_feature_div',
    '#detailBullets_feature_div',
    '#detailBulletsWrapper_feature_div',
    '#prodDetails',
    '#productDetails_db_sections',
    '#important-information',
    '#technicalSpecifications_section_1',
    '#glance_icons_div',
    '[id^="productDetails_"]',
    'table.prodDetTable',
    '.detail-bullet-list',
  ]

  const candidates = []
  for (const selector of SELECTORS) {
    for (const node of document.querySelectorAll(selector)) {
      if (!candidates.includes(node)) candidates.push(node)
    }
  }

  // Keep only the outermost matches. Checking one direction is not enough: the
  // selectors overlap both ways, so a wrapper matched late would otherwise be appended
  // around a region already taken, and the whole section lands in the fixture twice.
  const picked = candidates
    .filter((node) => !candidates.some((other) => other !== node && other.contains(node)))
    // Document order, so the same page always produces the same file.
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))

  const doc = document.implementation.createHTMLDocument('fixture')
  doc.documentElement.lang = document.documentElement.lang || ''
  for (const node of picked) doc.body.append(node.cloneNode(true))

  // Strip what a fixture must not carry: behaviour, styling, images, any DOM a browser
  // extension injected into the page, and — the dangerous one — form controls. Amazon
  // parks session state in hidden inputs: `customerId`, `isCustomerLoggedIn` and a live
  // `aapiCsrfToken` all ride along in the product details region. None of it is any use
  // for origin extraction and all of it identifies the person who captured the page.
  for (const el of doc.querySelectorAll(
    'script, style, noscript, img, svg, iframe, link, form, input, select, textarea, button, option'
  )) {
    el.remove()
  }
  for (const el of doc.querySelectorAll('*')) {
    for (const attr of [...el.attributes]) {
      const drop =
        attr.name.startsWith('on') ||
        ['srcset', 'style', 'href', 'src'].includes(attr.name) ||
        attr.value.includes('chrome-extension://')
      if (drop) el.removeAttribute(attr.name)
    }
  }

  // Candidate label/value pairs, from every shape Amazon uses. For your eyes, not for
  // the expected value — read that off the page itself.
  const pairs = []
  for (const row of doc.querySelectorAll('tr')) {
    const label = row.querySelector('th')?.textContent?.trim()
    const value = row.querySelector('td')?.textContent?.trim()
    if (label && value) pairs.push({ label, value: value.replace(/\s+/g, ' ').slice(0, 80) })
  }
  for (const item of doc.querySelectorAll('li')) {
    const parts = item.textContent?.split(/[:：]/)
    if (parts && parts.length === 2 && parts[0].trim().length < 40) {
      pairs.push({
        label: parts[0].replace(/\s+/g, ' ').trim(),
        value: parts[1].replace(/\s+/g, ' ').trim().slice(0, 80),
      })
    }
  }

  const canonical = `${location.origin}${location.pathname}`.replace(/\/ref=.*$/, '')

  const html = `<!doctype html>\n<html lang="${doc.documentElement.lang}">\n<head>\n<meta charset="utf-8">\n<title>${marketplace} ${asin}</title>\n<link rel="canonical" href="${canonical}">\n</head>\n<body>\n${doc.body.innerHTML}\n</body>\n</html>\n`

  const name = `${marketplace}__${asin}.html`
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)

  console.log(
    `%c${name}%c  ${(html.length / 1024).toFixed(0)} KB, down from ${(document.documentElement.outerHTML.length / 1024 / 1024).toFixed(1)} MB`,
    'font-weight:bold',
    ''
  )
  console.log('Candidate label/value pairs — confirm the origin one against the page:')
  console.table(pairs)
  console.log('Paste this back, with the origin corrected if the table got it wrong:')
  const origin = pairs.find((p) =>
    /origin|publication|ursprung|pays|paese|pa[ií]s|原産/i.test(p.label)
  )
  console.log(
    JSON.stringify(
      {
        marketplace,
        asin,
        url: canonical,
        originLabel: origin?.label ?? null,
        originText: origin?.value ?? null,
        note: origin ? '' : 'no origin field visible — this is a valuable fixture',
      },
      null,
      2
    )
  )
})()
