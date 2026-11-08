# Tamil Voiceover for Netflix 🎬→🗣️

A personal browser extension that gives **English Netflix movies a live Tamil voiceover**, so the whole family can enjoy them together. It speaks natural, conversational Tamil the way people talk at home.

> Status: **Phase 1 built (untested on real Netflix).** It reads subtitles, speaks them with the free browser voice and dips the volume. Translation and the Sarvam voice come in Phase 2. Try it with the [Phase 1 test guide](docs/PHASE1-TEST.md). See [docs/ROADMAP.md](docs/ROADMAP.md).

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

Check each provider's current pricing before subscribing.

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
