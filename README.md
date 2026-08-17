# FX-DREAM international LP · portable static draft

This branch contains the controlled English FX-DREAM landing page, Form A
interface, receipt screen, application terms, and privacy notice. It is a
source and review checkpoint, not a publication or sales authorization.

## Safety boundary

- The permitted 13 sections are rendered; evidence-gated sections 6, 8, 9,
  10, and 13 are absent.
- PRO SYSTEM is JPY 1,000,000 and PRIVATE IMPLEMENTATION is JPY 2,000,000.
  The core product is identical; the difference is support only.
- The exact owner-supplied optional Traders Trust registration URL is retained.
- The old Japanese LP, Google Form, LINE funnel, legacy images, and old outcome
  claims are not included.
- This draft remains `noindex` and its application button fails closed unless
  an approved server-side intake endpoint is supplied at build time.
- No API secret, owner authorization value, wallet, payment address, customer
  record, or email-provider credential belongs in this repository.

## Build and test

Node.js 22 or later is sufficient; there are no runtime packages to install.

```sh
node scripts/build.mjs
node --test tests/*.test.mjs
```

The default build uses `https://preview.invalid/` as a non-live canonical URL
and leaves Form A submission disabled. A later approved host build supplies:

```sh
FXD_SITE_URL=https://approved-host.example/ \
FXD_APPLICATION_ENDPOINT=https://approved-api.example/api/applications \
node scripts/build.mjs
```

Both values must be HTTPS. The generated files are written to `dist/`.

## Publication boundary

Do not publish this sales-intake site with GitHub Pages. The official
[GitHub Pages usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
disallow sites primarily directed at facilitating commercial transactions.
GitHub is used here for source control, review, and QA only.

Before deployment, a separate approved host, exact seller/contracting-entity
identity, jurisdiction and operative terms, verified intake origin, verified
transactional-email configuration, and FX-DREAM publication/release authority
are still required. Quote, payment, contract, delivery, and guarantee stages
remain disabled and separate.
