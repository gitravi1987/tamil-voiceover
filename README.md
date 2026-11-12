# Tamil Voiceover for Netflix 🎬→🗣️

A personal browser extension that gives **English Netflix movies a live Tamil voiceover**, so the whole family can enjoy them together. It speaks natural, conversational Tamil the way people talk at home.

> Status: **Free-first (v0.2.2).** Phase 2 with Sarvam works (about 80% on real Netflix) but costs money, so we are now testing a fully free route: a browser Tamil voice picker and a free-translator lab (see [docs/LAB-TEST.md](docs/LAB-TEST.md) and [docs/VOICE-OPTIONS.md](docs/VOICE-OPTIONS.md)). Earlier note: Phase 2 waited for its first real Netflix test. Phase 1 (subtitle reading, speaking, volume dip) worked on real Netflix. Phase 2 adds conversational Tamil translation and the Sarvam voice. Try it with the [Phase 2 test guide](docs/PHASE2-TEST.md). See [docs/ROADMAP.md](docs/ROADMAP.md).

## How it works

```
 Netflix (Chrome/Edge on laptop  ──HDMI──▶  TV)
        │
        ▼
 1. Subtitle watcher    reads each subtitle line as Netflix shows it
        │               (Tamil subtitles if available, else English)
        ▼
 2. Translator          AI rewrites it into spoken, conversational Tamil
        │
        ▼
 3. Tamil voice (TTS)   Sarvam AI Bulbul (main) · ElevenLabs (option)
        │               · Edge built-in Tamil voice (free fallback)
        ▼
 4. Audio mixer         brief, gentle dip of Netflix volume only while
                        the Tamil line is spoken, then back to normal
```

It works like a live interpreter sitting next to you. **It never downloads, records or unlocks Netflix's audio or video.** It only reads the subtitle text already shown on your own screen.

## Voice options

| Provider | Quality | Cost | Role |
|---|---|---|---|
| Sarvam AI (Bulbul) | Very good, Indian-made | Paid API (free starter credits) | **Main** |
| ElevenLabs | Very expressive | Paid (small free tier) | Option |
| Microsoft Edge built-in Tamil voices | Good | Free | Fallback |

**Cost per full movie (estimate, not measured):** every line is translated (Rs 2 per 1,000 characters) and then voiced (Rs 2 per 1,000 characters on v4 Flash). For a movie with roughly 80,000 to 100,000 characters of dialogue that is about **Rs 320 to 400**. The popup shows a running estimate and stops at a spending cap you set. Check Sarvam's pricing page for current rates.

## Setup (home laptop, once Phase 1 is ready)
1. Download this repo → open `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** → **Load unpacked** → select the `extension/` folder.
3. Open the extension popup → paste your Sarvam API key → pick a voice.
4. Play a Netflix movie with subtitles on (they can be hidden from view later).

## Known limits
- Works only in a **desktop browser**, not in the Netflix app on smart TVs (cast or HDMI the laptop instead).
- Netflix audio is DRM-protected, so the extension cannot separate the actor's voice from the music. It only dips the overall volume briefly. Real-time voice removal is a [research item](docs/ROADMAP.md).
- It's a voiceover, not lip-synced dubbing.

## Docs
- [Product requirements](docs/PRD.md) · [Architecture](docs/ARCHITECTURE.md) · [Roadmap](docs/ROADMAP.md) · [Legal & ethics](docs/LEGAL.md)
- AI coding assistants: read [CLAUDE.md](CLAUDE.md)

## Legal
For **personal, non-commercial family use** only. See [docs/LEGAL.md](docs/LEGAL.md). Not affiliated with Netflix.
