# Source coverage

Which sources the wider search may use, and the evidence for including or excluding each.

Plan 05-01 makes this a gate: **an adapter is written only after its hit rate has been
measured against the fixture corpus and recorded here.** The point is to avoid building
adapters on intuition, and to stop a rejected source being re-proposed later because
nobody wrote down why it lost.

> This lives at the repo root rather than in `docs/`, which is gitignored in full (see
> `CLAUDE.md`). A record whose purpose is to stop a decision being re-litigated is no use
> on one machine.

## Status: the gate has not been run

The corpus is **1 product**. The measurement needs roughly 30 before a hit rate means
anything, so **no source has passed the gate and no adapter has been written**.

```
$ node --experimental-strip-types scripts/spike/measure-source-coverage.mjs
Corpus: 1 product(s) across 1 marketplace(s)
  amazon.ca/B09ZP3WS5G — China
Gate NOT runnable: 1 products, 30 is the minimum
```

`src/shared/deep/registry.ts` is therefore empty, and a test asserts it stays that way.
Everything around it — permissions, orchestration, streaming, merging — is built and
tested, so an adapter that passes the gate is a small addition rather than a new
subsystem.

## What gets measured

For each product and each candidate source:

| Column | Meaning |
| ------ | ------- |
| `found` | The source had this product at all |
| `stated` | It stated an origin |
| `correct` | That origin matched the human-verified ground truth in the fixture's `.expected.json` |

`correct` is the number that matters. A source with high `stated` and low `correct` is
worse than no source, because it manufactures confidence — which is the failure this
whole project exists to correct.

## Candidates

From plan 05-04, ordered by how close each gets to actual manufacture. **None measured.**

| Source | Yields | Claim kind | Status |
| ------ | ------ | ---------- | ------ |
| FCC ID database | Grantee, often the manufacturing address | `manufactured` | Not measured |
| Other retailers (B&H, Walmart, Target, Home Depot) | Their own stated origin, keyed on GTIN | `manufactured` | Not measured — see note |
| Brand's own site / spec sheets | Stated origin | `manufactured` / `brand-origin` | Not measured |
| Wikidata | Brand → parent company → HQ country | `brand-origin` | Not measured |
| FDA establishment registration | Registered manufacturing sites | `manufactured` | Not measured |
| GS1 barcode prefix | Country that **registered the barcode** | `brand-origin` at most | Not measured |
| Customs / bills of lading | Actual shipments and their export country | `shipped-from` | Deferred to plan 06 — commercial, key-gated |

### On fetching from other retailers

**Decision (2026-09-06): in scope.** An endpoint that serves a request is fair to
request from; securing it is the operator's business, not ours. What we must not do is
work around a control that is there to stop us — no evading bot detection, no
impersonating a browser we are not, no ignoring a `robots.txt` we have been served.

Two things to be accurate about when these are measured:

- **These are mostly not APIs.** Walmart's is partner-gated behind an approved key, and
  Home Depot and B&H publish none; the closest to a public interface is the
  unauthenticated JSON endpoint behind Target's own product pages. In practice this
  candidate means parsing product HTML, which is more fragile than an API and needs
  re-checking at gate time rather than assumed from this note.
- **Requests come from the user's IP.** A retailer that objects does not reply with a
  refusal, it blocks the address — and the person locked out of Home Depot is the user,
  not us. That is the real cost, and it is a reason to keep request volume low and to
  cache hard, not a reason to skip the candidate.

The gate settles this on evidence rather than argument: a source that gets blocked has a
poor hit rate and fails 05-01 on the numbers.

### On GS1 prefixes

Include only if labelled honestly. A barcode prefix identifies the GS1 member
organisation the **brand owner** registered with — not where anything was made. "690 =
made in China" is a widely repeated myth, and repeating it would be exactly the class of
confident wrong answer this project exists to avoid.

## Host permissions

The manifest declares **no** `optional_host_permissions`. With an empty source registry
there are no origins to ask for, and the minimal declaration for zero origins is none —
carrying `https://*/*` in the meantime would have every intermediate build tell a Chrome
Web Store reviewer the extension "may request access to all websites", with no answer to
why. A test asserts the manifest stays clean while the registry is empty.

When a source passes the gate, add exactly the origins it needs, and nothing wider.

### Where the permission grant happens

`chrome.permissions.request()` needs two things at once: the API, and a user gesture.

| Context | Has the API | Has a gesture |
| ------- | ----------- | ------------- |
| Content script | **No** — only `chrome.dom`, `chrome.i18n`, `chrome.storage` and part of `chrome.runtime` | Yes |
| Service worker | Yes | **No** |
| Options page / popup | Yes | Yes |

So the grant is made from the **options page**, which is what plan 05-02 meant by
"offer 'always allow deep search' in options". The button in the panel cannot prompt; the
service worker checks whether the origins are already held and replies `needs-permission`
if not, and the panel points the user at settings.

## Growing the corpus

```bash
# In the browser console on an Amazon product page:
#   paste scripts/capture-fixture.js
node --experimental-strip-types scripts/scrub-fixture.mjs <captured.html>
```

Then write the sibling `.expected.json` from what a human reads off the rendered page —
never from what a parser produced, or the corpus stops being ground truth.
