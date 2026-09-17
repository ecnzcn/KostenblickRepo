German trained data for `tesseract.js`, vendored locally so language data
is never fetched from a third-party CDN.

- `deu.traineddata.gz` - from npm package `@tesseract.js-data/deu@1.0.0`,
  the `4.0.0_best_int` variant (LSTM engine, integer-quantized - the
  smallest of the two variants that package ships, ~1.3 MB gzipped),
  MIT license.

Cached on first OCR use via a Workbox `CacheFirst` runtime route (see
`vite.config.ts`), not precached at install.
