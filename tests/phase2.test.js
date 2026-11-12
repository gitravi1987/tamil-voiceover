// Phase 2 tests: Sarvam pipeline (background worker) and Sarvam playback (content script).
// Run: node tests/phase2.test.js
// Everything is faked: a fake Sarvam server and a fake audio engine. No real key or network is used.
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = "TEST-KEY-123";
let n = 0;
const ok = (name) => console.log(`PASS ${++n}. ${name}`);

// ---------------- Part A: background.js (Node, fake chrome + fake fetch) ----------------
function makeBackground(initialStore, fetchImpl) {
  const store = { ...initialStore };
  const listeners = [];
  const chrome = {
    storage: {
      local: {
        get: async (d) => ({ ...d, ...store }),
        set: async (o) => { Object.assign(store, JSON.parse(JSON.stringify(o))); },
      },
    },
    runtime: { onMessage: { addListener: (fn) => listeners.push(fn) } },
  };
  const ctx = { chrome, fetch: fetchImpl, console, setTimeout, clearTimeout, JSON, Math, Date, Promise, Map, String, Number, Error, Object };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "extension/background.js"), "utf8"), ctx);
  return {
    store,
    send: (msg) => new Promise((res) => listeners[0](msg, {}, res)),
  };
}

function fakeSarvam({ translateStatus = 200, ttsStatus = 200, errorCode = "" } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, headers: init.headers, body });
    const isTranslate = url.endsWith("/translate");
    const status = isTranslate ? translateStatus : ttsStatus;
    if (status !== 200) return { ok: false, status, json: async () => ({ error: { code: errorCode } }) };
    return {
      ok: true,
      status: 200,
      json: async () => (isTranslate ? { translated_text: "டேய் இங்க வா" } : { audios: ["QUJD"] }),
    };
  };
  impl.calls = calls;
  return impl;
}

async function partA() {
  // no key
  let f = fakeSarvam();
  let bg = makeBackground({}, f);
  let r = await bg.send({ type: "line", text: "Hello there" });
  assert.deepStrictEqual([r.ok, r.error], [false, "no_key"]);
  assert.strictEqual(f.calls.length, 0);
  ok("no key saved: nothing is sent and the page gets 'no_key'");

  // full pipeline
  f = fakeSarvam();
  bg = makeBackground({ sarvamKey: KEY }, f);
  r = await bg.send({ type: "line", text: "Come here, this is important." });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.audio, "QUJD");
  assert.strictEqual(r.tamil, "டேய் இங்க வா");
  assert.strictEqual(f.calls.length, 2);
  const [tr, tts] = f.calls;
  assert.strictEqual(tr.url, "https://api.sarvam.ai/translate");
  assert.strictEqual(tr.headers["api-subscription-key"], KEY);
  assert.deepStrictEqual(tr.body, {
    input: "Come here, this is important.",
    source_language_code: "en-IN",
    target_language_code: "ta-IN",
    model: "mayura:v1",
    mode: "modern-colloquial",
  });
  assert.strictEqual(tts.url, "https://api.sarvam.ai/text-to-speech");
  assert.strictEqual(tts.headers["api-subscription-key"], KEY);
  assert.deepStrictEqual(tts.body, {
    text: "டேய் இங்க வா",
    language_code: "ta-IN",
    model: "bulbul:v4-flash",
    speaker: "simran_en_conversation",
    pace: 1,
    output_audio_codec: "mp3",
  });
  ok("English line -> /translate (modern-colloquial Tamil) -> /text-to-speech with the exact documented fields");

  assert.ok(!JSON.stringify(r).includes(KEY), "key must never be returned to the page");
  ok("the answer sent back to the page never contains the API key");

  // usage counter
  const u = bg.store.usage;
  assert.strictEqual(u.translateChars, "Come here, this is important.".length);
  assert.strictEqual(u.ttsChars, "டேய் இங்க வா".length);
  const expected = ((u.translateChars * 2) + (u.ttsChars * 2)) / 1000;
  assert.ok(Math.abs(u.rupees - expected) < 1e-6, `rupees ${u.rupees} vs ${expected}`);
  ok("spending counter counts translated + voiced characters at the documented prices");

  // cache: same line again costs nothing
  await bg.send({ type: "line", text: "Come here, this is important." });
  assert.strictEqual(f.calls.length, 2);
  assert.strictEqual(bg.store.usage.translateChars, u.translateChars);
  ok("a repeated line is served from memory and not billed again");

  // Tamil line: skip translation
  f = fakeSarvam();
  bg = makeBackground({ sarvamKey: KEY }, f);
  await bg.send({ type: "line", text: "டேய், இங்க வா!", skipTranslate: true });
  assert.strictEqual(f.calls.length, 1);
  assert.ok(f.calls[0].url.endsWith("/text-to-speech"));
  assert.strictEqual(f.calls[0].body.text, "டேய், இங்க வா!");
  ok("a line that is already Tamil skips translation (voice only)");

  // v3 maps persona ID -> short name; custom speaker overrides
  f = fakeSarvam();
  bg = makeBackground({ sarvamKey: KEY, model: "bulbul:v3", speaker: "simran_en_conversation" }, f);
  await bg.send({ type: "line", text: "Hi" });
  assert.strictEqual(f.calls[1].body.speaker, "simran");
  assert.strictEqual(f.calls[1].body.model, "bulbul:v3");
  f = fakeSarvam();
  bg = makeBackground({ sarvamKey: KEY, customSpeaker: "gokul_ta_narration", rate: 3 }, f);
  await bg.send({ type: "line", text: "Hi" });
  assert.strictEqual(f.calls[1].body.speaker, "gokul_ta_narration");
  assert.strictEqual(f.calls[1].body.pace, 2); // clamped to Sarvam's 0.5-2.0
  ok("v3 uses the short speaker name, custom speaker overrides, pace is clamped to 0.5-2.0");

  // spending cap
  f = fakeSarvam();
  bg = makeBackground({ sarvamKey: KEY, capRupees: 0.001 }, f);
  r = await bg.send({ type: "line", text: "This will not be sent" });
  assert.deepStrictEqual([r.ok, r.error], [false, "cap"]);
  assert.strictEqual(f.calls.length, 0);
  ok("spending cap blocks the call before anything is sent");

  // error mapping
  const cases = [
    [{ translateStatus: 403, errorCode: "invalid_api_key_error" }, "invalid_key"],
    [{ translateStatus: 402, errorCode: "insufficient_quota_error" }, "no_credits"],
    [{ translateStatus: 429, errorCode: "rate_limit_exceeded_error" }, "rate_limited"],
    [{ translateStatus: 500, errorCode: "internal_server_error" }, "server"],
  ];
  for (const [opts, kind] of cases) {
    bg = makeBackground({ sarvamKey: KEY }, fakeSarvam(opts));
    r = await bg.send({ type: "line", text: "Hello" });
    assert.deepStrictEqual([r.ok, r.error], [false, kind]);
  }
  bg = makeBackground({ sarvamKey: KEY }, async () => { throw new Error("offline"); });
  r = await bg.send({ type: "line", text: "Hello" });
  assert.strictEqual(r.error, "network");
  ok("403 / 402 / 429 / 500 / offline are each reported with a clear reason");

  // key hygiene in the page-side code
  const content = fs.readFileSync(path.join(root, "extension/content.js"), "utf8");
  assert.ok(!/sarvamKey|api-subscription-key|api\.sarvam\.ai/.test(content), "content.js must not know the key or call Sarvam");
  const popup = fs.readFileSync(path.join(root, "extension/popup.js"), "utf8");
  assert.ok(!/console\.log\([^)]*[Kk]ey/.test(popup));
  ok("content.js (the Netflix-page script) contains no key and no Sarvam address");
}

// ---------------- Part B: content.js with fake chrome.runtime + fake AudioContext ----------------
function fakeEnv(settings) {
  window.__settings = settings;
  window.__messages = [];
  window.__played = [];
  window.__statuses = [];
  window.__reply = (msg) => ({ ok: true, tamil: "தமிழ்", audio: "QUJD" });
  window.chrome = {
    storage: {
      local: {
        get: (d, cb) => cb({ ...d, ...window.__settings }),
        set: (o) => { if (o.status) window.__statuses.push(o.status); },
      },
      onChanged: { addListener() {} },
    },
    runtime: {
      sendMessage: (msg) => {
        window.__messages.push(msg);
        return new Promise((res) => setTimeout(() => res(window.__reply(msg)), window.__delay ? window.__delay(msg) : 10));
      },
    },
  };
  window.speechSynthesis = { speaking: false, getVoices: () => [], addEventListener() {}, speak() {}, cancel() {}, pause() {}, resume() {} };
  window.SpeechSynthesisUtterance = class {};
  window.AudioContext = class {
    constructor() { this.state = "running"; this.destination = {}; }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    createGain() { const g = { gain: { value: 1 }, connect() {} }; window.__gain = g; return g; }
    async decodeAudioData(b) { return { duration: 0.4, bytes: b.byteLength }; }
    createBufferSource() {
      const s = {
        connect() {},
        start() {
          window.__played.push({ gain: window.__gain.gain.value });
          s._t = setTimeout(() => s.onended && s.onended(), 400);
        },
        stop() { clearTimeout(s._t); },
      };
      return s;
    }
  };
}

async function openPage(browser, settings) {
  const page = await browser.newPage();
  await page.addInitScript(fakeEnv, settings);
  await page.goto("file://" + path.join(__dirname, "mock-netflix.html"));
  await page.addScriptTag({ path: path.join(root, "extension/content.js") });
  return page;
}
const setSub = (page, t) => page.evaluate((x) => { document.querySelector(".player-timedtext").textContent = x; }, t);
const volume = (page) => page.evaluate(() => document.getElementById("v").volume);
const get = (page, k) => page.evaluate((key) => window[key], k);

async function partB() {
  const browser = await chromium.launch();

  // 1. English line -> background -> audio played at boosted gain, volume dips then restores
  let page = await openPage(browser, { mode: "sarvam", dip: 0.25, boost: 1.8 });
  await setSub(page, "Come here.");
  await sleep(350);
  assert.deepStrictEqual((await get(page, "__messages")).map((m) => [m.type, m.text, m.skipTranslate]), [["line", "Come here.", false]]);
  const played = await get(page, "__played");
  assert.strictEqual(played.length, 1);
  assert.strictEqual(played[0].gain, 1.8);
  assert.ok(Math.abs((await volume(page)) - 0.25) < 0.03, "movie volume should dip while Tamil plays, got " + (await volume(page)));
  ok("Sarvam mode: line is sent to the background, audio plays at the chosen loudness, movie volume dips");
  await sleep(650);
  assert.ok(Math.abs((await volume(page)) - 1) < 0.03, "volume should be restored");
  ok("movie volume returns to normal when the Tamil line ends");

  // 2. Tamil line -> skipTranslate
  await setSub(page, "");
  await sleep(150);
  await setSub(page, "டேய், வா!");
  await sleep(150);
  const msgs = await get(page, "__messages");
  assert.strictEqual(msgs[msgs.length - 1].skipTranslate, true);
  ok("a Tamil subtitle is sent with skipTranslate = true");
  await page.close();

  // 3. stale answer is discarded: first line slow, second fast
  page = await openPage(browser, { mode: "sarvam" });
  await page.evaluate(() => { window.__delay = (m) => (m.text === "slow one" ? 600 : 10); });
  await setSub(page, "slow one");
  await sleep(150);
  await setSub(page, "fast one");
  await sleep(1300);
  assert.strictEqual((await get(page, "__played")).length, 1, "only the newest line may be played");
  ok("a slow answer for an old line is dropped when a newer line has arrived");
  assert.ok(Math.abs((await volume(page)) - 1) < 0.03);
  await page.close();

  // 4. error -> no audio, volume untouched, friendly note
  page = await openPage(browser, { mode: "sarvam" });
  await page.evaluate(() => { window.__reply = () => ({ ok: false, error: "no_credits" }); });
  await setSub(page, "Hello");
  await sleep(300);
  assert.strictEqual((await get(page, "__played")).length, 0);
  assert.ok(Math.abs((await volume(page)) - 1) < 0.03);
  const st = (await get(page, "__statuses")).pop();
  assert.ok(/credits/i.test(st.note), "status should explain: " + st.note);
  ok("out-of-credits: nothing plays, volume stays normal, the popup status explains why");
  await page.close();

  // 5. too late -> dropped
  page = await openPage(browser, { mode: "sarvam", maxLateMs: 200 });
  await page.evaluate(() => { window.__delay = () => 450; });
  await setSub(page, "Hello");
  await sleep(700);
  assert.strictEqual((await get(page, "__played")).length, 0);
  assert.ok(/too late/.test((await get(page, "__statuses")).pop().note));
  ok("an answer that arrives later than the limit is dropped, not spoken out of sync");
  await page.close();

  // 6. Phase 1 modes do not call Sarvam
  page = await openPage(browser, { mode: "timing" });
  await setSub(page, "Hello");
  await sleep(300);
  assert.strictEqual((await get(page, "__messages")).length, 0);
  ok("free browser-voice modes never contact Sarvam");
  await page.close();

  await browser.close();
}

(async () => {
  await partA();
  await partB();
  console.log(`\nAll ${n} Phase 2 checks passed.`);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
