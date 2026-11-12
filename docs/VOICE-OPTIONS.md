# Free voice and translation options (researched 2026-11)

Goal: run the voiceover **for free** while the owner decides whether it is worth paying for. Sarvam (translate + voice) works but costs money, so it stays as an optional paid mode.

How to read this: **Verified** = seen on the owner's PC or in our own tests. **Reported** = stated by a source I found. **Unknown** = nothing trustworthy found; only a test on the owner's desktop will settle it.

## 1. Free Tamil voices

| Option | Free? | Tamil | What we know |
|---|---|---|---|
| **Edge neural voices** (browser `speechSynthesis`) | Yes | Yes | **Verified**: "Microsoft Pallavi Online (Natural) - Tamil (India)" appears on the owner's Edge. Valluvar (male) exists as a Microsoft neural voice (reported). Whether Edge lists Valluvar, or Sri Lanka / Singapore / Malaysia Tamil voices, on a given PC is **unknown**: the popup's **Tamil voice** list shows exactly what the browser has. Needs internet. Not open source. |
| **IndicF5** (AI4Bharat) | Yes | Yes | Reported: MIT licence, Tamil supported, trained on about 1,417 hours; weights are gated on Hugging Face (accept the terms). Speed on a normal PC: **unknown**. |
| **Indic Parler-TTS** (AI4Bharat) | Yes | Yes | Reported: Apache 2.0 (third-party pages), gated; needs Tamil script; a GPU is recommended, CPU "significantly slower". Speed: **unknown**. |
| **MMS-TTS Tamil** (Meta, `facebook/mms-tts-tam`) | Yes | Yes | Reported: CC BY-NC 4.0 (fine for personal use). No Tamil quality or speed data found. Reported problem: int8 quantisation of VITS models produced noise. |
| AI4Bharat Indic-TTS (2022) | Yes | Yes | Exists, Tamil among 13 languages; licence and speed **unknown**. |
| Piper / sherpa-onnx Tamil voices | Yes | ? | Nothing found. **Unknown**. |
| Azure Speech free tier (F0) | Yes, limited | Yes | Reported: 0.5 million neural characters per month, throttled (not billed) when exceeded; commercial use of free-tier audio reportedly needs a paid resource. Needs an Azure account. Same Pallavi / Valluvar voices with more control. |
| ElevenLabs free | Yes, tiny | Unproven | 10,000 credits a month (owner's screenshot): a fraction of one movie. |

No source gave a trustworthy Tamil quality ranking or real-time speed for any open-source model. The honest next step for these is a benchmark on the owner's own desktop (CPU/GPU unknown).

## 2. Free translation (English -> Tamil)

| Option | Free? | What we know |
|---|---|---|
| **Browser built-in Translator API** (on-device) | Yes, no account, no key | Reported: Tamil (`ta`) is on Chrome's supported list; one source says Edge supports it from version 148 (others conflict). **Observed in our real-Chromium test**: the API exists and reports English -> Tamil as `downloadable` (supported, model must be downloaded; the download could not finish inside our sandbox). Whether the owner's Edge supports it, how fast, and **how spoken or formal the Tamil is** are **unknown**: the popup's **Check free translator** button measures all three. |
| **Azure Translator Free (F0)** | Yes, 2 million characters a month | Reported on Microsoft's pricing page. Needs an Azure account. Tamil support and style not confirmed (likely formal). |
| **NLLB-200 distilled 600M** | Yes | CC BY-NC 4.0, "research model". Runs in the browser through transformers.js (quantised files about 419 MB + 471 MB). One other-language fine-tune measured 155 ms per sentence with CTranslate2 int8 on 8 CPU threads. Tamil speed: **unknown**. |
| **IndicTrans2 distilled 200M** (AI4Bharat) | Yes | MIT (reported). English -> Indic including Tamil. Tamil CPU speed **unknown**. |
| **Gemini API free tier** | Yes, but | Limits are unclear and conflicting (one source says about 20 requests a day for Flash, others 100 to 1,000); free-tier data may be used to improve Google products. A movie needs 1,000+ one-line requests, so it is a poor fit. |
| Sarvam Translate | **No**: Rs 2 per 1,000 characters | The only option with a `modern-colloquial` (spoken Tamil) mode. Kept as an optional paid mode. |

### The main risk of going fully free
Machine translation tends to produce **formal, literary Tamil** (reported by several vendor blogs; weak evidence). Read aloud by a natural voice it can sound like a news reader, which goes against our "conversational Tamil" rule. Sarvam's colloquial mode fixed this. Ideas to test later: a small rule-based "make it spoken" rewriter, or a free LLM.

## 3. Plan
1. **Now (v0.2.2):** voice picker + **Check free translator** lab (this release). Zero cost.
2. **After the lab results:** if the built-in translator works and the Tamil is acceptable, add a fully free mode (browser translator + browser Tamil voice) using the existing queue and catch-up logic.
3. If not: Azure Translator F0 (needs an account), then in-browser NLLB / IndicTrans2.
4. Open-source local voices: write a benchmark kit and run it on the owner's desktop before building anything.

## Sources
- Chrome Translator API: https://developer.chrome.com/docs/ai/translator-api
- Azure Translator pricing: https://azure.microsoft.com/pricing/details/translator/
- Azure Speech pricing: https://azure.microsoft.com/en-in/pricing/details/cognitive-services/speech-services
- IndicF5: https://huggingface.co/ai4bharat/IndicF5
- Indic Parler-TTS: https://huggingface.co/ai4bharat/indic-parler-tts
- MMS-TTS: https://huggingface.co/facebook/mms-tts
- IndicTrans2 (en to Indic, distilled 200M): https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M
- NLLB-200 distilled 600M for transformers.js: https://huggingface.co/Xenova/nllb-200-distilled-600M
- Gemini API free-tier discussion: https://discuss.ai.google.dev/t/gemini-api-rate-limits-free-tier/125968
- Azure Tamil voice names (Pallavi, Valluvar): https://json2video.com/ai-voices/azure/voices/ta-in-pallavineural/
