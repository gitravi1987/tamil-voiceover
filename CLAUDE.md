# CLAUDE.md: rules for AI coding sessions

## Project
Chrome/Edge MV3 extension that adds a live **Tamil voiceover** to English **Netflix** movies for family viewing (laptop → TV via HDMI). Owner: Ravikumar (learning Python/AI; explain changes simply, show reasoning).

## Hard rules
1. **Netflix only.** Do not add other OTT platforms unless the owner asks.
2. **Never touch protected media.** No DRM circumvention, no capturing/recording/downloading Netflix audio or video, no Widevine tricks. Only read subtitle text rendered in the page DOM.
3. **Tamil must be conversational** (spoken Chennai-style Tamil, e.g. "enna panra?"), never formal written Tamil. Applies to translations *and* to rewriting Netflix's own Tamil subtitles.
4. **Audio:** only a short, gentle volume dip on the `<video>` element while a Tamil line plays. Keep music impact minimal. Never mute for long stretches.
5. **Secrets:** API keys live only in `chrome.storage.local` or an untracked `.env`. Never commit keys; never hard-code them.
6. Ask the owner before adding paid services or new dependencies.

## Model advice (always do this)
At the start of each task, tell the owner in one line which model fits, so they can switch manually:
- **Opus**: planning, architecture, tricky debugging, research decisions (e.g. voice-removal R&D), long polished writing.
- **Sonnet**: normal coding, writing/editing files and docs, tests, routine fixes. *Default for most build work.*
- **Haiku**: tiny edits, renames, quick factual questions, formatting.
Flag it explicitly when the current model is more expensive than the task needs.

## Layout
- `extension/`: the extension (`manifest.json`, `content.js`, `popup.html`)
- `docs/`: PRD, architecture, roadmap, legal

## Testing
Logic test (no Netflix needed): `node tests/phase1.test.js`. Real test: see `docs/PHASE1-TEST.md`. Load `extension/` unpacked in Chrome (`chrome://extensions` → Developer mode → Load unpacked), open a Netflix title with subtitles on, and check the DevTools console for `[TamilVO]` logs.
