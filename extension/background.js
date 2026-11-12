// Tamil Voiceover: background service worker (Phase 2)
//
// This is the ONLY place the Sarvam API key is used. The Netflix page and the
// content script never see the key: they send us an English subtitle line and
// get back Tamil text + audio.
//
// Pipeline for one line:   English text --(Sarvam Translate)--> conversational Tamil
//                          Tamil text   --(Sarvam Text-to-Speech)--> audio
//
// API details verified against https://docs.sarvam.ai on 2026-11-12:
//   POST https://api.sarvam.ai/translate         header: api-subscription-key
//        body: input, source_language_code, target_language_code, model, mode  -> { translated_text }
//   POST https://api.sarvam.ai/text-to-speech    header: api-subscription-key
//        body: text, language_code, model, speaker, pace, output_audio_codec   -> { audios: [base64] }

const API = "https://api.sarvam.ai";

// Prices in rupees per 1,000 characters (Pay-as-you-go, docs pricing page, 2026-11-12).
// Bulbul v4 Flash was half price (Rs 1) during an offer that ended 12 Nov; we count Rs 2 to be safe.
const PRICE_PER_1000 = { translate: 2.0, "bulbul:v4-flash": 2.0, "bulbul:v3": 3.0 };

const DEFAULTS = {
  sarvamKey: "",
  model: "bulbul:v4-flash",
  speaker: "gokul_ta_narration", // Tamil-native persona (owner's choice); override with "Custom speaker ID" in the popup
  customSpeaker: "",
  rate: 1.0,           // spoken pace (Sarvam accepts 0.5 to 2.0)
  capRupees: 150,      // hard stop: no more API calls once the estimated spend reaches this
  usage: { translateChars: 0, ttsChars: 0, rupees: 0 },
};

const SAMPLE_TEXT = "டேய், இங்க வா! இது ரொம்ப முக்கியம்.";

// ---- small in-memory cache (repeat lines like "Cooper!" are not billed twice) ----
const cache = new Map();
const CACHE_MAX = 100;
function cacheGet(k) {
  if (!cache.has(k)) return null;
  const v = cache.get(k);
  cache.delete(k);
  cache.set(k, v); // refresh position (LRU)
  return v;
}
function cacheSet(k, v) {
  cache.set(k, v);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

// ---- helpers -------------------------------------------------------------
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || lo));

// v3 uses short names ("simran"); v4 Flash uses persona IDs ("simran_en_conversation").
function speakerFor(model, id) {
  return model === "bulbul:v3" ? String(id).split("_")[0] : id;
}

function rupees(chars, key) {
  return (chars / 1000) * PRICE_PER_1000[key];
}

class SarvamError extends Error {
  constructor(kind, detail) {
    super(kind);
    this.kind = kind;
    this.detail = detail;
  }
}

async function callSarvam(path, body, key) {
  let res;
  try {
    res = await fetch(API + path, {
      method: "POST",
      headers: { "api-subscription-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new SarvamError("network");
  }
  if (!res.ok) {
    let code = "";
    try {
      code = (await res.json()).error.code;
    } catch (e) { /* body was not JSON */ }
    if (code === "insufficient_quota_error" || res.status === 402) throw new SarvamError("no_credits");
    if (res.status === 403) throw new SarvamError(code === "invalid_api_key_error" ? "invalid_key" : "forbidden");
    if (res.status === 429) throw new SarvamError("rate_limited");
    throw new SarvamError("server", res.status);
  }
  return res.json();
}

// ---- usage counter (persisted so the popup can show it) ------------------
let usage = null;
async function loadUsage() {
  if (!usage) usage = { ...DEFAULTS.usage, ...((await chrome.storage.local.get({ usage: DEFAULTS.usage })).usage) };
  return usage;
}
async function addUsage(translateChars, ttsChars, model) {
  const u = await loadUsage();
  u.translateChars += translateChars;
  u.ttsChars += ttsChars;
  u.rupees = +(u.rupees + rupees(translateChars, "translate") + rupees(ttsChars, model)).toFixed(4);
  await chrome.storage.local.set({ usage: u });
}

// ---- the work ------------------------------------------------------------
async function speakLine({ text, skipTranslate }) {
  const s = await chrome.storage.local.get(DEFAULTS);
  if (!s.sarvamKey) throw new SarvamError("no_key");
  const u = await loadUsage();
  const model = s.model in PRICE_PER_1000 ? s.model : DEFAULTS.model;
  const speaker = speakerFor(model, (s.customSpeaker || s.speaker).trim());
  const pace = clamp(s.rate, 0.5, 2.0);
  const input = String(text).slice(0, 1000); // Mayura limit: 1,000 characters

  const cacheKey = [model, speaker, pace, skipTranslate ? "t" : "e", input].join("|");
  const hit = cacheGet(cacheKey);
  if (hit) return { ...hit, cached: true };

  // Spend guard: refuse before calling if this line could push us over the cap.
  const worstCase = rupees(input.length, "translate") + rupees(input.length * 2, model);
  if (u.rupees + worstCase > s.capRupees) throw new SarvamError("cap");

  let tamil = input;
  let translateChars = 0;
  if (!skipTranslate) {
    const t = await callSarvam("/translate", {
      input,
      source_language_code: "en-IN",
      target_language_code: "ta-IN",
      model: "mayura:v1",
      mode: "modern-colloquial", // spoken, conversational Tamil (CLAUDE.md rule 3)
    }, s.sarvamKey);
    tamil = t.translated_text;
    translateChars = input.length;
  }

  const v = await callSarvam("/text-to-speech", {
    text: tamil.slice(0, 2500),
    language_code: "ta-IN",
    model,
    speaker,
    pace,
    output_audio_codec: "mp3",
  }, s.sarvamKey);

  await addUsage(translateChars, tamil.length, model);
  const result = { ok: true, tamil, audio: v.audios[0] };
  cacheSet(cacheKey, result);
  return result;
}

async function speakSample() {
  return speakLine({ text: SAMPLE_TEXT, skipTranslate: true });
}

// ---- messages from the popup and the Netflix page ------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const job = msg && msg.type === "line" ? speakLine(msg) : msg && msg.type === "sample" ? speakSample() : null;
  if (!job) return false;
  job.then(sendResponse, (e) => sendResponse({ ok: false, error: e.kind || "unknown" }));
  return true; // keep the channel open for the async answer
});
