Vendored, self-hosted assets for `tesseract.js` (local, offline OCR) so the
app never fetches OCR code/WASM from a third-party CDN at runtime.

- `worker.min.js` - from `tesseract.js@7.0.0` (`dist/worker.min.js`), Apache-2.0
- `tesseract-core-simd-lstm.wasm(.js)` - from `tesseract.js-core@7.0.0`
  (SIMD + LSTM-only build: smallest/fastest variant compatible with the
  `4.0.0_best_int` trained data used for recognition), Apache-2.0

These are cached on first OCR use via a Workbox `CacheFirst` runtime route
(see `vite.config.ts`), not precached at install, so they never bloat the
initial PWA download for users who never import a document.

To upgrade: reinstall the matching `tesseract.js`/`tesseract.js-core`
version and copy these two files again from `node_modules`.
