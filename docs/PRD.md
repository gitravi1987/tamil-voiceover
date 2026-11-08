# PRD: Tamil Voiceover for Netflix

## Problem
Family members who don't follow English can't enjoy English movies on Netflix. Many titles have no Tamil dub, and reading subtitles is tiring or impossible for kids and elders.

## Users
- **Primary:** Ravikumar's family watching together, Netflix in Chrome/Edge on a laptop connected to the TV by HDMI.
- **Operator:** Ravikumar, who starts it, picks the voice and manages API keys.

## Goals
1. Every dialogue line is heard in natural, **conversational Tamil**.
2. Music and effects stay as intact as possible.
3. One-click on/off; works on any Netflix title that has subtitles.

## Requirements
| # | Requirement |
|---|---|
| R1 | Detect each subtitle line on Netflix in real time (Tamil track preferred, English otherwise). |
| R2 | Translate or rewrite into spoken Tamil (not formal written Tamil). |
| R3 | Speak via Sarvam Bulbul (main), ElevenLabs (option), Edge voice (free fallback). |
| R4 | Dip video volume gently only while a Tamil line plays (default ~25%, adjustable). |
| R5 | Target latency from subtitle appearing to Tamil voice starting: **< 1.5 s**. |
| R6 | Skip or shorten lines when the speech would overlap the next subtitle. |
| R7 | Popup settings: on/off, provider, voice, dip level, speed, API keys. |
| R8 | Keys stored locally only; nothing is sent anywhere except the chosen AI/TTS APIs. |

## Non-goals (for now)
- Other OTT platforms, smart-TV apps, mobile.
- Lip-synced dubbing or voice cloning of actors.
- Recording or exporting dubbed movies.

## Success criteria
- The family watches one full movie with the voiceover on and prefers it to subtitles.
- Fewer than ~1 in 20 lines noticeably late or mistranslated.
- Monthly API cost stays within a budget the owner sets.

## Open questions
- Real-time voice removal (keep music 100% untouched): feasibility, latency, legality → research item.
- Male/female voice per speaker: can we infer it reliably?
