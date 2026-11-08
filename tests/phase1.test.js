// Phase 1 logic test using a fake Netflix page + fake speech engine.
// Run: node tests/phase1.test.js   (needs Playwright, already installed in the cloud session)
// This does NOT test real Netflix (needs an account and DRM); it tests our own logic.
const { chromium } = require("playwright");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Injected before the page loads: fake voices + fake chrome.storage.
function fakeEnv(settings) {
  window.__testSettings = settings;
  window.__spoken = [];
  window.chrome = {
    storage: {
      local: { get: (d, cb) => cb({ ...d, ...window.__testSettings }), set() {} },
      onChanged: { addListener() {} },
    },
  };
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  let timer = null, startTimer = null, active = null;
  const synth = {
    speaking: false,
    getVoices: () => [{ name: "Fake Tamil", lang: "ta-IN" }, { name: "Fake English", lang: "en-US" }],
    addEventListener() {},
    speak(u) {
      window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name });
      active = u; synth.speaking = true;
      startTimer = setTimeout(() => u.onstart && u.onstart(), 20);
      timer = setTimeout(() => { synth.speaking = false; active = null; u.onend && u.onend(); }, 400);
    },
    cancel() {
      clearTimeout(timer); clearTimeout(startTimer);
      const u = active; active = null; synth.speaking = false;
      if (u) setTimeout(() => u.onerror && u.onerror(), 5); // real browsers report cancel asynchronously
    },
    pause() {}, resume() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth });
}

async function openPage(browser, settings) {
  const page = await browser.newPage();
  await page.addInitScript(fakeEnv, settings);
  await page.goto("file://" + path.join(__dirname, "mock-netflix.html"));
  await page.addScriptTag({ path: path.join(root, "extension/content.js") });
  return page;
}
const setSub = (page, text) => page.evaluate((t) => { document.querySelector(".player-timedtext").textContent = t; }, text);
const spoken = (page) => page.evaluate(() => window.__spoken);
const volume = (page) => page.evaluate(() => document.getElementById("v").volume);

(async () => {
  const browser = await chromium.launch();
  let n = 0;
  const ok = (name) => console.log(`PASS ${++n}. ${name}`);

  // --- tamil mode ---
  let page = await openPage(browser, { mode: "tamil", dip: 0.25 });
  await setSub(page, "டேய், இங்க வா!");
  await sleep(300);
  assert.strictEqual((await spoken(page)).length, 1);
  assert.strictEqual((await spoken(page))[0].voice, "Fake Tamil");
  assert.ok(Math.abs((await volume(page)) - 0.25) < 0.02, "volume should dip to ~0.25, got " + (await volume(page)));
  ok("Tamil line is spoken with the Tamil voice and volume dips to 25%");
  await sleep(500);
  assert.ok(Math.abs((await volume(page)) - 1) < 0.02, "volume should be restored");
  ok("volume is restored after the line ends");

  await setSub(page, "Get out of here.");
  await sleep(200);
  assert.strictEqual((await spoken(page)).length, 1, "English line must be skipped in tamil mode");
  ok("English line is skipped in Tamil mode");

  // flicker: text vanishes and returns within the debounce window -> spoken once
  await setSub(page, "");
  await sleep(150);
  await setSub(page, "வா போகலாம்");
  await setSub(page, "");
  await sleep(20);
  await setSub(page, "வா போகலாம்");
  await sleep(250);
  assert.strictEqual((await spoken(page)).length, 2, "flicker must not repeat the line");
  ok("a flickering subtitle is spoken only once");

  // same text after a real gap -> spoken again
  await sleep(500);
  await setSub(page, "");
  await sleep(150);
  await setSub(page, "வா போகலாம்");
  await sleep(200);
  assert.strictEqual((await spoken(page)).length, 3);
  ok("the same line is spoken again after a real gap");

  // newest line wins, volume still restores
  await setSub(page, "முதல் வரி");
  await sleep(150);
  await setSub(page, "இரண்டாவது வரி");
  await sleep(900);
  const texts = (await spoken(page)).map((s) => s.text);
  assert.strictEqual(texts[texts.length - 1], "இரண்டாவது வரி");
  assert.ok(Math.abs((await volume(page)) - 1) < 0.02, "volume must restore after interrupted line");
  ok("a new line interrupts the old one and the volume still restores");

  // seeking cancels speech and restores volume
  await setSub(page, "");
  await sleep(150);
  await setSub(page, "நீண்ட வரி");
  await sleep(150);
  await page.evaluate(() => document.getElementById("v").dispatchEvent(new Event("seeking")));
  await sleep(300);
  assert.ok(Math.abs((await volume(page)) - 1) < 0.02, "seek must restore volume");
  ok("seeking stops the voice and restores volume");
  await page.close();

  // --- timing mode ---
  page = await openPage(browser, { mode: "timing", dip: 0.5 });
  await setSub(page, "Get out of here.");
  await sleep(300);
  const s = await spoken(page);
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].voice, "Fake English");
  assert.ok(Math.abs((await volume(page)) - 0.5) < 0.02);
  ok("timing mode speaks English with the English voice and dips to the chosen level");
  await page.close();

  // --- off switch ---
  page = await openPage(browser, { enabled: false });
  await setSub(page, "டேய்");
  await sleep(200);
  assert.strictEqual((await spoken(page)).length, 0);
  ok("nothing is spoken when switched off");
  await page.close();

  await browser.close();
  console.log(`\nAll ${n} checks passed.`);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
