# Roadmap

- [x] **P0: Setup:** repo, README, PRD, architecture, rules (CLAUDE.md)
- [~] **P1: Proof of concept:** capture Netflix subtitles, speak them with the free browser voice, volume dip. *Built and logic-tested on a fake page; waiting for a real Netflix test ([guide](PHASE1-TEST.md)).*
- [~] **P2: Quality voice:** conversational-Tamil translation (Sarvam Mayura, modern-colloquial), Sarvam Bulbul voice, settings popup, key storage, spending cap. *First real test: too slow, lines cut off. v0.2.1 adds an ordered queue, auto speed-up, skipping and timings; waiting for a re-test ([guide](PHASE2-TEST.md)).*
- [~] **P2.2: Free-first:** Tamil voice picker + free-translator lab (v0.2.2). Next: a fully free mode (browser translator + browser voice) if the lab results are good; Sarvam stays as an optional paid mode. Research in [VOICE-OPTIONS.md](VOICE-OPTIONS.md).
- [ ] **P3: Polish:** caching, timing/overlap handling, speed control, male/female voices, ElevenLabs option
- [ ] **R&D: Music untouched:** investigate real-time voice removal on laptop audio output (latency, hardware, legality)
- [ ] **P4: Share:** test with family for a few weeks, then publish a write-up (LinkedIn / X / Reddit) and consider making the repo public
