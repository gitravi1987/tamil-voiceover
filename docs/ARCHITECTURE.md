# Architecture (Phase 2)

```
Netflix page (netflix.com/watch/*)
 └─ content.js            reads subtitle text, plays audio, dips the movie volume
      │  chrome.runtime.sendMessage({ type: "line", text, skipTranslate })
      ▼
 background.js            service worker. The ONLY code that knows the Sarvam key
      ├─ POST /translate         mayura:v1, mode "modern-colloquial"  -> spoken Tamil
      ├─ POST /text-to-speech    bulbul:v4-flash (or v3), mp3        -> base64 audio
      ├─ spending counter + hard cap (blocks calls before they are sent)
      └─ in-memory cache (repeat lines are not billed twice)
 popup.html / popup.js    settings, key (write-only), Speak sample, usage, diagnostics
```

## Per-line flow
1. Subtitle text changes -> de-duplicated (80 ms debounce) -> `seq` number given.
2. English line: translate then speak. Tamil-script line: speak only (`skipTranslate`).
3. If a newer line arrived while waiting, the old answer is discarded (newest line wins).
4. If the answer took longer than `maxLateMs` (4 s), it is dropped rather than spoken out of sync.
5. Audio plays through Web Audio with a gain node (voice loudness setting) and the movie volume dips; it is restored when the line ends. A safety timer restores the volume after about 3 s of silence.

## Modes
- `sarvam`: translate + Sarvam voice (needs a key)
- `tamil`: free browser voice, Tamil-script subtitles only (Phase 1)
- `timing`: free browser voice for any line, English voice for English (Phase 1 timing test)

## Sarvam facts (read from docs.sarvam.ai on 2026-11-12; re-check before relying on them)
- Auth header: `api-subscription-key`. Auth failures return HTTP 403 (not 401); exhausted credits return 402 `insufficient_quota_error`.
- Translate: `POST https://api.sarvam.ai/translate`, max 1,000 characters (mayura:v1), modes `formal | modern-colloquial | classic-colloquial | code-mixed`, answer field `translated_text`.
- Text-to-speech: `POST https://api.sarvam.ai/text-to-speech`, max 2,500 characters, answer `audios` (base64). `pace` 0.5 to 2.0. Pitch and loudness are not supported on v3 / v4 Flash.
- v4 Flash voices are persona IDs like `simran_en_conversation`. The only Tamil-tagged v4 Flash personas listed are `gokul_ta_narration`, `vijay_ta_narration`, `aravind_ta_ads`, `aravind_ta_suspense` (all male). Whether the Simran personas read Tamil text well is judged by ear, not guaranteed by the docs.
- Price (pay-as-you-go, per 1,000 characters): translate Rs 2, Bulbul v4 Flash Rs 2 (Rs 1 during an offer that ended 12 Nov), Bulbul v3 Rs 3.
- Rate limits (pay-as-you-go): 60 requests per minute for translate and 60 for text-to-speech.

## Why this design
- Netflix media is DRM-protected, so the page cannot read its audio. Subtitle text is ordinary page content, which is why we use it.
- The key lives only in `chrome.storage.local` and is used only in `background.js`. Tests check that `content.js` never mentions it.
- Sarvam's docs advise against putting keys in client-side code. A personal extension on your own computer is the intended exception: nothing is published and the key never reaches a web page.

## Music
Any volume dip lowers the music too, because DRM audio cannot be split into voice and music in the browser. Keeping the music fully untouched is a separate research item (see ROADMAP).
