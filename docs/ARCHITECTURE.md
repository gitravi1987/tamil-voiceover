# Architecture

```
content.js (runs on netflix.com/watch/*)
 ├─ SubtitleWatcher   MutationObserver on Netflix's subtitle container
 │                    (".player-timedtext"; selector may change, keep it in one place)
 ├─ Translator        English/formal-Tamil → conversational Tamil
 │                    (LLM with style prompt; cache per title+line)
 ├─ TTSProvider       interface speak(text) → audio
 │   ├─ SarvamProvider      (main, paid)
 │   ├─ ElevenLabsProvider  (option, paid)
 │   └─ EdgeSpeechProvider  (window.speechSynthesis, ta-IN, free fallback)
 └─ AudioMixer        dips <video>.volume while Tamil audio plays, restores after;
                      drops stale lines when the player has moved on
popup.html / popup.js  settings saved to chrome.storage.local
```

## Data flow per line
1. Subtitle text changes → de-duplicate → enqueue with video timestamp.
2. Translate (cache hit = instant).
3. Generate the voice → play → dip the volume during playback.
4. If the video was paused or seeked, flush the queue.

## Why this design
- Netflix media is DRM-protected; the page cannot read its audio. Subtitle text is ordinary page content, which is why we use it.
- The provider interface lets us switch voices or translators without touching other code.

## Later research
Real-time voice/music separation on the laptop's audio output (outside the browser), so music isn't affected at all. Needs latency and legal review before building.
