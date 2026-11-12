// Tests: sound descriptions such as "[ BREATHES DEEPLY ]" are not voiced (v0.2.3).
// Run: node tests/captions.test.js   (fake Netflix page, fake Sarvam, fake voices; no network)
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (name) => console.log(`PASS ${++n}. ${name}`);

function fakeEnv(settings) {
  window.__settings = settings;
  window.__messages = [];
  window.__spoken = [];
  window.__statuses = [];
  window.chrome = {
    storage: {
      local: { get: (d, cb) => cb({ ...d, ...window.__settings }), set: (o) => { if (o.status) window.__statuses.push(JSON.parse(JSON.stringify(o.status))); } },
      onChanged: { addListener() {} },
    },
    runtime: {
      sendMessage: (msg) => {
        window.__messages.push({ text: msg.text, skipTranslate: msg.skipTranslate });
        return Promise.resolve({ ok: true, tamil: "தமிழ்", audio: btoa(msg.text.replace(/[^\x00-\x7f]/g, "?")), translateMs: 1, ttsMs: 1 });
      },
    },
  };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
    speaking: false, getVoices: () => [], addEventListener() {}, cancel() {}, pause() {}, resume() {},
    speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onstart && u.onstart(), 5); setTimeout(() => u.onend && u.onend(), 30); },
  } });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  window.AudioContext = class {
    constructor() { this.state = "running"; this.destination = {}; }
    resume() { return Promise.resolve(); }
    createGain() { return { gain: { value: 1 }, connect() {} }; }
    async decodeAudioData() { return {}; }
    createBufferSource() { const s = { connect() {}, start() { setTimeout(() => s.onended && s.onended(), 30); }, stop() {} }; return s; }
  };
}

async function openPage(browser, settings) {
  const page = await browser.newPage();
  await page.addInitScript(fakeEnv, settings);
  await page.goto("file://" + path.join(__dirname, "mock-netflix.html"));
  await page.addScriptTag({ path: path.join(root, "extension/lab.js") });
  await page.addScriptTag({ path: path.join(root, "extension/content.js") });
  return page;
}
const show = async (page, t) => { await page.evaluate((x) => { document.querySelector(".player-timedtext").textContent = x; }, t); await sleep(250); };
const clear = async (page) => { await page.evaluate(() => { document.querySelector(".player-timedtext").textContent = ""; }); await sleep(120); };
const sent = (page) => page.evaluate(() => window.__messages.map((m) => m.text));
const lastStatus = async (page) => (await page.evaluate(() => window.__statuses)).pop();

(async () => {
  const browser = await chromium.launch();

  // 1-3: Sarvam mode
  let page = await openPage(browser, { mode: "sarvam" });
  for (const t of ["[ BREATHES DEEPLY ]", "(sighs)", "♪ ♪", "♪ Singing along to the radio ♪", "[BREATHES", "..."]) {
    await show(page, t);
    await clear(page);
  }
  assert.deepStrictEqual(await sent(page), [], "no sound description may reach Sarvam: " + JSON.stringify(await sent(page)));
  const st = await lastStatus(page);
  assert.strictEqual(st.captionsSkipped, 6);
  assert.ok(/sound-description/.test(st.note));
  ok("[ BREATHES DEEPLY ], (sighs), ♪ lines, an unclosed bracket and '...' are never translated or voiced, and are counted");

  await show(page, "[GROANS] Come on!");
  await clear(page);
  await show(page, "(Whispering) Hello there. [DOOR CLOSES]");
  await clear(page);
  await show(page, "- Where are you going?");
  await clear(page);
  assert.deepStrictEqual(await sent(page), ["Come on!", "Hello there.", "Where are you going?"]);
  ok("dialogue next to a sound description keeps only the dialogue (and a leading dash is dropped)");

  await show(page, "[ MUSIC ] டேய் இங்க வா");
  const msgs = await page.evaluate(() => window.__messages);
  assert.deepStrictEqual(msgs[msgs.length - 1], { text: "டேய் இங்க வா", skipTranslate: true });
  ok("a Tamil-script line is kept and still goes straight to the voice (no translation)");
  await page.close();

  // 4: setting off restores the old behaviour
  page = await openPage(browser, { mode: "sarvam", skipSoundCaptions: false });
  await show(page, "[ BREATHES DEEPLY ]");
  assert.deepStrictEqual(await sent(page), ["[ BREATHES DEEPLY ]"]);
  ok("with the checkbox off, sound descriptions are sent as before");
  await page.close();

  // 5: free browser-voice mode
  page = await openPage(browser, { mode: "timing" });
  await show(page, "[MUSIC]");
  await clear(page);
  await show(page, "Hello");
  assert.deepStrictEqual(await page.evaluate(() => window.__spoken), ["Hello"]);
  ok("the free browser-voice modes skip sound descriptions too");
  await page.close();

  await browser.close();
  console.log(`\nAll ${n} caption checks passed.`);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
