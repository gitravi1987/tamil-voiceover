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
    speaker: "gokul_ta_narration",
    pace: 1.2,
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

  // the page can ask for a faster pace to catch up; timings come back
  f = fakeSarvam();
  bg = makeBackground({ sarvamKey: KEY }, f);
  r = await bg.send({ type: "line", text: "Faster please", pace: 1.6 });
  assert.strictEqual(f.calls[1].body.pace, 1.6);
  assert.ok(typeof r.translateMs === "number" && typeof r.ttsMs === "number");
  ok("a per-line pace from the page is used, and translate/voice timings are returned");

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
// The fake "audio" is just the line text in base64, so the test can see WHICH line was played.
function fakeEnv(settings) {
  window.__settings = settings;
  window.__messages = [];
  window.__played = [];
  window.__stopped = 0;
  window.__statuses = [];
  window.__audioMs = 400;
  window.__reply = (msg) => ({ ok: true, tamil: "தமிழ்", audio: btoa(unescape(encodeURIComponent(msg.text))), translateMs: 120, ttsMs: 340 });
  window.chrome = {
    storage: {
      local: {
        get: (d, cb) => cb({ ...d, ...window.__settings }),
        set: (o) => { if (o.status) window.__statuses.push(JSON.parse(JSON.stringify(o.status))); },
      },
      onChanged: { addListener() {} },
    },
    runtime: {
      sendMessage: (msg) => {
        window.__messages.push({ ...msg, at: performance.now() });
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
    async decodeAudioData(b) { return { label: new TextDecoder().decode(new Uint8Array(b)) }; }
    createBufferSource() {
      const s = {
        connect() {},
        start() {
          window.__played.push({ line: s.buffer.label, gain: window.__gain.gain.value });
          s._t = setTimeout(() => s.onended && s.onended(), window.__audioMs);
        },
        stop() { window.__stopped++; clearTimeout(s._t); },
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
// show a new subtitle line: let the previous one stay visible past the 80 ms flicker filter,
// clear it briefly, then show the new text (real subtitles stay up far longer than this)
async function line(page, t, gap = 120) { await sleep(gap); await setSub(page, ""); await sleep(gap); await setSub(page, t); }
const volume = (page) => page.evaluate(() => document.getElementById("v").volume);
const get = (page, k) => page.evaluate((key) => window[key], k);
const lastStatus = async (page) => (await get(page, "__statuses")).pop();

async function partB() {
  const browser = await chromium.launch();

  // B1: one English line
  let page = await openPage(browser, { dip: 0.25, boost: 1.8 });
  await setSub(page, "Come here now.");
  await sleep(250);
  let msgs = await get(page, "__messages");
  assert.deepStrictEqual([msgs[0].type, msgs[0].text, msgs[0].skipTranslate, msgs[0].pace], ["line", "Come here now.", false, 1.2]);
  let played = await get(page, "__played");
  assert.deepStrictEqual(played.map((p) => [p.line, p.gain]), [["Come here now.", 1.8]]);
  assert.ok(Math.abs((await volume(page)) - 0.25) < 0.03, "movie volume should dip, got " + (await volume(page)));
  ok("Sarvam mode: line sent at the base speed (1.2x), played at the chosen loudness, movie volume dips");
  await sleep(600);
  assert.ok(Math.abs((await volume(page)) - 1) < 0.03, "volume should be restored");
  const st = await lastStatus(page);
  assert.strictEqual(st.spoken, 1);
  assert.deepStrictEqual([st.recent[0].translateMs, st.recent[0].voiceMs], [120, 340]);
  ok("volume returns to normal after the line; timings (translate 120 ms, voice 340 ms) reach the popup status");

  // B2: Tamil line -> skipTranslate
  await line(page, "டேய், இங்க வா!");
  await sleep(100);
  msgs = await get(page, "__messages");
  assert.strictEqual(msgs[msgs.length - 1].skipTranslate, true);
  ok("a Tamil subtitle is sent with skipTranslate = true");
  await page.close();

  // B3: fast dialogue: lines play in order and are never cut off; speed rises as lines wait
  page = await openPage(browser, {});
  await page.evaluate(() => { window.__audioMs = 900; }); // long lines, so the next lines pile up
  await setSub(page, "This is the first line");
  await line(page, "Here is the second line");
  await line(page, "And now the third line");
  await sleep(3300);
  played = await get(page, "__played");
  assert.deepStrictEqual(played.map((p) => p.line), ["This is the first line", "Here is the second line", "And now the third line"]);
  assert.strictEqual(await get(page, "__stopped"), 0, "no line may be cut off");
  msgs = await get(page, "__messages");
  assert.ok(msgs[1].pace > msgs[0].pace && msgs[2].pace > msgs[1].pace, "pace should rise: " + msgs.map((m) => m.pace));
  ok("fast dialogue: all lines play in order, none is cut off, speed rises while lines wait");
  assert.ok(Math.abs((await volume(page)) - 1) < 0.03);
  await page.close();

  // B4: requests run in parallel (do not wait for the previous line)
  page = await openPage(browser, {});
  await page.evaluate(() => { window.__delay = () => 600; });
  await setSub(page, "first slow line here");
  await line(page, "second slow line here");
  await line(page, "third slow line here");
  await sleep(100);
  msgs = await get(page, "__messages");
  assert.strictEqual(msgs.length, 3, "all three requests should be in flight before the first answer");
  ok("Sarvam requests for new lines start immediately, in parallel (up to 3)");
  await page.close();

  // B5: far too late -> skipped
  page = await openPage(browser, { maxLagMs: 200 });
  await page.evaluate(() => { window.__delay = () => 450; });
  await setSub(page, "Hello there my friend");
  await sleep(700);
  assert.strictEqual((await get(page, "__played")).length, 0);
  assert.ok(/too far behind/.test((await lastStatus(page)).note));
  assert.ok(Math.abs((await volume(page)) - 1) < 0.03);
  ok("a line that would start far too late is skipped, not spoken out of sync");
  await page.close();

  // B6: short line skipped while behind
  page = await openPage(browser, {});
  await page.evaluate(() => { window.__audioMs = 1200; }); // long first line: the next three pile up behind it
  await setSub(page, "This is a long first line");
  await line(page, "Okay.", 100);
  await line(page, "Here comes the third line", 100);
  await line(page, "And this is the fourth line", 100);
  await sleep(4300);
  played = (await get(page, "__played")).map((p) => p.line);
  assert.ok(!played.includes("Okay."), "short line should be skipped while behind: " + played);
  assert.ok(played.includes("Here comes the third line") && played.includes("And this is the fourth line"));
  ok("while behind, tiny lines like 'Okay.' are skipped so the voice catches up");
  await page.close();

  // B7: error -> skipped, explained, volume untouched
  page = await openPage(browser, {});
  await page.evaluate(() => { window.__reply = () => ({ ok: false, error: "no_credits" }); });
  await setSub(page, "Hello there");
  await sleep(300);
  assert.strictEqual((await get(page, "__played")).length, 0);
  assert.ok(Math.abs((await volume(page)) - 1) < 0.03);
  assert.ok(/credits/i.test((await lastStatus(page)).note));
  ok("out-of-credits: nothing plays, volume stays normal, the popup status explains why");
  await page.close();

  // B8: seeking clears waiting lines
  page = await openPage(browser, {});
  await setSub(page, "This is the first line");
  await line(page, "This is the second line");
  await sleep(150); // second line is now read and waiting behind the first
  assert.strictEqual((await get(page, "__messages")).length, 2);
  await page.evaluate(() => document.getElementById("v").dispatchEvent(new Event("seeking")));
  await sleep(1000);
  played = (await get(page, "__played")).map((p) => p.line);
  assert.ok(!played.includes("This is the second line"), "lines queued before a seek must not play: " + played);
  assert.ok(Math.abs((await volume(page)) - 1) < 0.03);
  ok("seeking clears the waiting lines and restores the volume");
  await page.close();

  // B9: optional catch-up pause
  page = await openPage(browser, { catchUpPause: true });
  await page.evaluate(() => {
    const v = document.getElementById("v");
    window.__vpaused = false; window.__pauses = 0; window.__plays = 0;
    Object.defineProperty(v, "paused", { get: () => window.__vpaused });
    v.pause = () => { window.__vpaused = true; window.__pauses++; v.dispatchEvent(new Event("pause")); };
    v.play = () => { window.__vpaused = false; window.__plays++; v.dispatchEvent(new Event("play")); return Promise.resolve(); };
    window.__delay = () => 300;
  });
  await setSub(page, "This is the first line");
  await line(page, "Here is the second line", 100);
  await line(page, "And now the third line", 100);
  await sleep(150);
  assert.strictEqual(await get(page, "__vpaused"), true, "movie should be paused while lines wait");
  await sleep(1900);
  assert.strictEqual(await get(page, "__vpaused"), false, "movie should resume after catching up");
  assert.strictEqual((await get(page, "__played")).length, 3);
  ok("catch-up option pauses the movie while lines wait and resumes once caught up; no line lost");
  await page.close();

  // B10: browser modes never contact Sarvam
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
