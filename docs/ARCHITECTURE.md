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

## Per-line flow (Phase 2.1: ordered queue)
1. Subtitle text changes -> de-duplicated (80 ms debounce) -> added to an ordered queue.
2. Its Sarvam request starts at once; up to 3 lines are in flight in parallel. English: translate then voice. Tamil-script: voice only (`skipTranslate`).
3. Lines play **in order** and a playing line is **never cut off** (only seek, pause or switching off stops it).
4. Catch-up rules when a line is about to play:
   - lag over `maxLagMs` (6 s): skipped;
   - behind (lag over 2.5 s or 2+ lines waiting) and the line has 2 words or fewer: skipped;
   - speed: each request asks for `base speed x (1 + 0.15 x lines waiting)`, up to 2.0 (Sarvam's limit).
5. Optional "Pause movie to catch up": pauses the video while 2+ lines wait and resumes when the queue is empty (normal player controls only).
6. Audio plays through Web Audio with a gain node (voice loudness); the movie volume dips and is restored when nothing follows straight away. A safety timer restores it after about 3 s of silence.
7. Timings per line (translate ms, voice ms, waited ms, total ms, speed) go to the popup status and Copy diagnostics.

Browser-voice modes (`tamil`, `timing`) still use the Phase 1 rule: the newest line interrupts the old one.

## Modes
- `sarvam`: translate + Sarvam voice (needs a key)
- `tamil`: free browser voice, Tamil-script subtitles only (Phase 1)
- `timing`: free browser voice for any line, English voice for English (Phase 1 timing test)

## Sarvam facts (read from docs.sarvam.ai on 2026-11-12; re-check before relying on them)
- Auth header: `api-subscription-key`. Auth failures return HTTP 403 (not 401); exhausted credits return 402 `insufficient_quota_error`.
- Translate: `POST https://api.sarvam.ai/translate`, max 1,000 characters (mayura:v1), modes `formal | modern-colloquial | classic-colloquial | code-mixed`, answer field `translated_text`.
- Text-to-speech: `POST https://api.sarvam.ai/text-to-speech`, max 2,500 characters, answer `audios` (base64). `pace` 0.5 to 2.0. Pitch and loudness are not supported on v3 / v4 Flash.
- v4 Flash voices are persona IDs like `simran_en_conversation`. The only Tamil-tagged v4 Flash personas listed are `gokul_ta_narration`, `vijay_ta_narration`, `aravind_ta_ads`, `aravind_ta_suspense` (all male). The default is `gokul_ta_narration` (the owner's choice after listening). Whether the Simran personas read Tamil text well is judged by ear, not guaranteed by the docs.
- Price (pay-as-you-go, per 1,000 characters): translate Rs 2, Bulbul v4 Flash Rs 2 (Rs 1 during an offer that ended 12 Nov), Bulbul v3 Rs 3.
- Rate limits (pay-as-you-go): 60 requests per minute for translate and 60 for text-to-speech.

## Why this design
- Netflix media is DRM-protected, so the page cannot read its audio. Subtitle text is ordinary page content, which is why we use it.
- The key lives only in `chrome.storage.local` and is used only in `background.js`. Tests check that `content.js` never mentions it.
- Sarvam's docs advise against putting keys in client-side code. A personal extension on your own computer is the intended exception: nothing is published and the key never reaches a web page.

## Music
Any volume dip lowers the music too, because DRM audio cannot be split into voice and music in the browser. Keeping the music fully untouched is a separate research item (see ROADMAP).
