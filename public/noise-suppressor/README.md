# RNNoise, vendored

Three files copied verbatim from `@sapphi-red/web-noise-suppressor`
(MIT, `docs/research/libraries.md` §3), at the version pinned in
`package.json`:

| File | Source in the package |
|---|---|
| `rnnoise-worklet.js` | `dist/rnnoise/workletProcessor.js` |
| `rnnoise.wasm` | `dist/rnnoise.wasm` |
| `rnnoise_simd.wasm` | `dist/rnnoise_simd.wasm` |

They are served from here rather than imported because an `AudioWorklet`
module is fetched by URL at runtime by the audio thread, not resolved by the
bundler, and the worklet fetches its own WebAssembly binary alongside.

Nothing loads them until a singer turns on **"I'm in a noisy room"** on the
record screen, so they never touch the initial bundle of any route
(`docs/research/mobile-guidelines.md` rule 44). They are used for the live
headphone monitor only and are never applied to the recorded audio — the
server pipeline does the real cleanup (`docs/AUDIO_ARCHITECTURE.md`).

Re-copy after a version bump:

```sh
cp node_modules/@sapphi-red/web-noise-suppressor/dist/rnnoise/workletProcessor.js public/noise-suppressor/rnnoise-worklet.js
cp node_modules/@sapphi-red/web-noise-suppressor/dist/rnnoise.wasm             public/noise-suppressor/rnnoise.wasm
cp node_modules/@sapphi-red/web-noise-suppressor/dist/rnnoise_simd.wasm        public/noise-suppressor/rnnoise_simd.wasm
```
