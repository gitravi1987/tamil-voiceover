// Tests for the Tamil voice picker and the free-tools lab (popup + Netflix-page script).
// Run: node tests/lab.test.js
// Everything is faked: browser voices, the built-in Translator API, chrome.* APIs. No network, no key.
const path = require("path");
const assert = require("assert");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const ok = (name) => console.log(`PASS ${++n}. ${name}`);

const VOICES = [
  { name: "Microsoft Pallavi Online (Natural) - Tamil (India)", lang: "ta-IN" },
  { name: "Microsoft Valluvar Online (Natural) - Tamil (India)", lang: "ta-IN" },
  { name: "Microsoft Saranya Online (Natural) - Tamil (Sri Lanka)", lang: "ta_LK" },
  { name: "Microsoft Heera - English (India)", lang: "en-IN" },
];
const PALLAVI = VOICES[0].name, VALLUVAR = VOICES[1].name;

// ---- popup page: fake chrome.*, voices, Translator ----
function popupEnv(opts) {
  window.__store = Object.assign({ sarvamKey: "SECRET-KEY" }, opts.store || {});
  window.__spoken = [];
  window.__copied = null;
  window.__pageReport = opts.pageReport || null;
  window.__voices = opts.voices;
  window.chrome = {
    storage: {
      local: {
        get: (d, cb) => cb({ ...d, ...window.__store }),
        set: (o, cb) => { Object.assign(window.__store, JSON.parse(JSON.stringify(o))); cb && cb(); },
        remove: (k, cb) => { delete window.__store[k]; cb && cb(); },
      },
      onChanged: { addListener() {} },
    },
    runtime: { getManifest: () => ({ version: "0.2.2" }), sendMessage: async () => ({ ok: false }) },
    tabs: {
      query: async () => [{ id: 7, url: opts.tabUrl || "https://example.com/" }],
      sendMessage: async () => window.__pageReport,
    },
  };
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  let onChange = null;
  // the real window.speechSynthesis cannot be overwritten by assignment, so define the fake explicitly
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
    getVoices: () => window.__voices,
    addEventListener: (type, fn) => { if (type === "voiceschanged") onChange = fn; },
    cancel() {},
    speak(u) { window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name, lang: u.lang, rate: u.rate }); },
  } });
  window.__fireVoicesChanged = () => onChange && onChange();
  if (opts.translator === "none") {
    Object.defineProperty(window, "Translator", { configurable: true, value: undefined }); // hide any real one
  } else if (opts.translator === "available") {
    window.Translator = { availability: async () => "available", create: async () => ({ translate: async (s) => "த• " + s }) };
  } else if (opts.translator === "unavailable") {
    window.Translator = { availability: async () => "unavailable", create: async () => { throw new Error("should not be called"); } };
  } else if (opts.translator === "hangs") {
    window.Translator = { availability: async () => "downloadable", create: () => new Promise(() => {}) };
  } else if (opts.translator === "needs-click") {
    window.Translator = { availability: async () => "downloadable", create: async () => { const e = new Error("Requires a user gesture"); e.name = "NotAllowedError"; throw e; } };
  }
  Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t) => { window.__copied = t; } } });
}

async function openPopup(browser, opts) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(popupEnv, opts);
  await page.goto("file://" + path.join(root, "extension/popup.html"));
  page.errors = errors;
  return page;
}
const optionTexts = (page) => page.$$eval("#browserVoice option", (os) => os.map((o) => o.textContent));
const get = (page, k) => page.evaluate((key) => window[key], k);

async function popupTests(browser) {
  // 1: only Tamil voices are listed (ta-IN and ta_LK), English voice is left out
  let page = await openPopup(browser, { voices: VOICES });
  let opts = await optionTexts(page);
  assert.strictEqual(opts.length, 4, JSON.stringify(opts));
  assert.ok(opts[0].startsWith("Auto"));
  assert.ok(opts.some((t) => t.includes("Pallavi")) && opts.some((t) => t.includes("Valluvar")) && opts.some((t) => t.includes("Saranya")));
  assert.ok(!opts.some((t) => t.includes("Heera")));
  assert.ok(/3 Tamil voice/.test(await page.textContent("#voiceHint")));
  ok("voice picker lists every Tamil voice the browser has (including ta_LK) and no English ones");

  // 2: choosing a voice saves it; Test voice speaks the Tamil sample with that voice
  await page.selectOption("#browserVoice", VALLUVAR);
  assert.strictEqual(await page.evaluate(() => window.__store.browserVoice), VALLUVAR);
  await page.click("#testVoice");
  const spoken = await get(page, "__spoken");
  assert.strictEqual(spoken.length, 1);
  assert.strictEqual(spoken[0].voice, VALLUVAR);
  assert.strictEqual(spoken[0].lang, "ta-IN");
  assert.ok(/[஀-௿]/.test(spoken[0].text));
  ok("choosing Valluvar saves it, and Test voice speaks a Tamil sentence with exactly that voice");
  await page.close();

  // 3: a saved choice is selected again next time
  page = await openPopup(browser, { voices: VOICES, store: { browserVoice: PALLAVI } });
  assert.strictEqual(await page.inputValue("#browserVoice"), PALLAVI);
  ok("the saved voice is pre-selected when the popup reopens");
  await page.close();

  // 4: no Tamil voices at first, they appear later (voiceschanged)
  page = await openPopup(browser, { voices: [VOICES[3]], store: { browserVoice: VALLUVAR } });
  assert.ok(/No Tamil voices/.test(await page.textContent("#voiceHint")));
  await page.click("#testVoice"); // must not crash without a Tamil voice
  assert.strictEqual((await get(page, "__spoken"))[0].voice, undefined);
  await page.evaluate((v) => { window.__voices = v; window.__fireVoicesChanged(); }, VOICES);
  assert.strictEqual(await page.inputValue("#browserVoice"), VALLUVAR);
  assert.ok(/3 Tamil voice/.test(await page.textContent("#voiceHint")));
  assert.strictEqual(page.errors.length, 0, page.errors.join("; "));
  ok("no Tamil voice yet: friendly hint, no crash; when voices load later the saved choice comes back");
  await page.close();

  // 5: lab with a working translator, tested in the popup and in the Netflix page
  const pageReport = { where: "Netflix page", hasTranslator: true, availability: "available", createMs: 5, ready: true, results: [{ english: "Hi", tamil: "வணக்கம்", ms: 12 }], error: null };
  page = await openPopup(browser, { voices: VOICES, translator: "available", tabUrl: "https://www.netflix.com/watch/1", pageReport });
  await page.click("#lab");
  await page.waitForFunction(() => document.getElementById("labOut").textContent.includes("[Netflix page]"));
  const out = await page.textContent("#labOut");
  assert.ok(out.includes("[Popup]") && out.includes("availability: available"));
  assert.strictEqual((out.match(/->/g) || []).length >= 6, true, "six sample translations expected");
  assert.ok(/\(\d+ ms\)/.test(out));
  assert.ok(out.includes("வணக்கம்"), "the Netflix-page result is shown too");
  const saved = await page.evaluate(() => window.__store.lab);
  assert.strictEqual(saved.popup.ready, true);
  assert.strictEqual(saved.popup.results.length, 6);
  ok("lab: six sample sentences are translated and timed in the popup, and the Netflix-page result is shown too");

  // 8: diagnostics carry the lab and the voices, never the key
  await page.click("#copyDiag");
  await sleep(100);
  const diag = JSON.parse(await get(page, "__copied"));
  assert.strictEqual(diag.lab.popup.ready, true);
  assert.strictEqual(diag.tamilVoicesSeenHere.length, 3);
  assert.strictEqual(diag.hasKey, true);
  assert.ok(!JSON.stringify(diag).includes("SECRET-KEY"));
  ok("Copy diagnostics includes the lab result and the Tamil voices seen, and never the API key");
  await page.close();

  // 6: no Translator at all, and the active tab is not Netflix
  page = await openPopup(browser, { voices: VOICES, translator: "none" });
  await page.click("#lab");
  await page.waitForFunction(() => document.getElementById("labOut").textContent.includes("[Netflix page]"));
  let t = await page.textContent("#labOut");
  assert.ok(t.includes("Translator API present: no") && t.includes("does not exist here"));
  assert.ok(t.includes("Not tested: the active tab is not a Netflix tab."));
  assert.strictEqual(page.errors.length, 0);
  ok("lab with no built-in translator: a clear message, and the non-Netflix tab is reported as not tested");
  await page.close();

  // 7: unsupported pair, and 'needs a click' failure
  page = await openPopup(browser, { voices: VOICES, translator: "unavailable" });
  await page.click("#lab");
  await page.waitForFunction(() => document.getElementById("labOut").textContent.includes("[Netflix page]"));
  assert.ok((await page.textContent("#labOut")).includes("not supported by this browser"));
  await page.close();
  page = await openPopup(browser, { voices: VOICES, translator: "needs-click" });
  await page.click("#lab");
  await page.waitForFunction(() => document.getElementById("labOut").textContent.includes("[Netflix page]"));
  t = await page.textContent("#labOut");
  assert.ok(t.includes("availability: downloadable") && t.includes("NotAllowedError"));
  ok("lab reports an unsupported language pair and a blocked model download in plain words");
  await page.close();

  // a model download that never finishes must not freeze the lab (short limit used for the test)
  page = await openPopup(browser, { voices: VOICES, translator: "hangs" });
  const hung = await page.evaluate(() => TamilVOLab.runTranslatorLab("Popup", { createMs: 300 }));
  assert.strictEqual(hung.ready, false);
  assert.ok(/Timeout/.test(hung.error) && /longer than/.test(hung.error), hung.error);
  ok("a translator download that never finishes ends with a clear timeout message instead of freezing the lab");
  await page.close();
}

// ---- Netflix page: browserVoice is honoured, and the lab message works ----
function pageEnv({ settings, withTranslator }) {
  window.__settings = settings;
  window.__spoken = [];
  window.__voices = settings.__voices;
  let listener = null;
  window.chrome = {
    storage: { local: { get: (d, cb) => cb({ ...d, ...window.__settings }), set() {} }, onChanged: { addListener() {} } },
    runtime: { onMessage: { addListener: (fn) => { listener = fn; } }, sendMessage: async () => ({ ok: false }) },
  };
  window.__lab = (msg) => new Promise((res) => { listener(msg, {}, res); });
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
    speaking: false,
    getVoices: () => window.__voices,
    addEventListener() {},
    cancel() {}, pause() {}, resume() {},
    speak(u) { window.__spoken.push({ text: u.text, voice: u.voice && u.voice.name }); setTimeout(() => u.onstart && u.onstart(), 5); setTimeout(() => u.onend && u.onend(), 50); },
  } });
  if (withTranslator) window.Translator = { availability: async () => "available", create: async () => ({ translate: async (s) => "தமிழ்:" + s }) };
  else Object.defineProperty(window, "Translator", { configurable: true, value: undefined }); // hide any real one
}

async function openNetflixPage(browser, settings, withTranslator = false) {
  const page = await browser.newPage();
  await page.addInitScript(pageEnv, { settings: { ...settings, __voices: VOICES }, withTranslator });
  await page.goto("file://" + path.join(__dirname, "mock-netflix.html"));
  await page.addScriptTag({ path: path.join(root, "extension/lab.js") });
  await page.addScriptTag({ path: path.join(root, "extension/content.js") });
  return page;
}
const setSub = (page, t) => page.evaluate((x) => { document.querySelector(".player-timedtext").textContent = x; }, t);

async function pageTests(browser) {
  const cases = [
    [{ mode: "tamil", browserVoice: VALLUVAR }, VALLUVAR, "the voice chosen in the popup is the one used on Netflix"],
    [{ mode: "tamil", browserVoice: "" }, PALLAVI, "with no choice, the first Tamil voice is used"],
    [{ mode: "tamil", browserVoice: "Some voice that no longer exists" }, PALLAVI, "a missing saved voice falls back to the first Tamil voice"],
  ];
  for (const [settings, expected, label] of cases) {
    const page = await openNetflixPage(browser, settings);
    await setSub(page, "டேய், வா!");
    await sleep(250);
    const spoken = await get(page, "__spoken");
    assert.strictEqual(spoken.length, 1, label);
    assert.strictEqual(spoken[0].voice, expected, label);
    ok(label);
    await page.close();
  }

  // lab message handled inside the Netflix page
  let page = await openNetflixPage(browser, {}, true);
  let report = await page.evaluate(() => window.__lab({ type: "lab-translator" }));
  assert.strictEqual(report.where, "Netflix page");
  assert.strictEqual(report.ready, true);
  assert.strictEqual(report.results.length, 6);
  assert.ok(report.results[0].tamil.startsWith("தமிழ்:"));
  ok("the Netflix-page script runs the translator lab when the popup asks, and answers with six timed results");
  await page.close();
  page = await openNetflixPage(browser, {}, false);
  report = await page.evaluate(() => window.__lab({ type: "lab-translator" }));
  assert.strictEqual(report.hasTranslator, false);
  assert.ok(/does not exist here/.test(report.error));
  ok("when the page has no built-in translator, the lab says so instead of failing");
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  await popupTests(browser);
  await pageTests(browser);
  await browser.close();
  console.log(`\nAll ${n} lab / voice-picker checks passed.`);
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
