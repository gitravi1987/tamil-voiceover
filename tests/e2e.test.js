// End-to-end: load the REAL unpacked extension in full Chromium, serve a fake Netflix page
// and a fake Sarvam API via request interception, and check what happens.
// Run: PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tests/e2e.test.js
// (the env var lets Playwright intercept the extension's own Sarvam requests; no real key or network is used)
const { chromium } = require("playwright");
const fs = require("fs"), os = require("os"), path = require("path");
const assert = require("assert");
const EXT = path.resolve(__dirname, "../extension");

// a real 0.6 s WAV tone so decodeAudioData works for real
function wavBase64(ms = 600, rate = 8000) {
  const n = Math.floor(rate * ms / 1000), buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(8000 * Math.sin(i / 5)), 44 + i * 2);
  return buf.toString("base64");
}
const MOCK = `<!doctype html><html><body><video id="v"></video><div class="player-timedtext"></div><button id="b">play</button></body></html>`;

async function run(withKey) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: true,
    channel: "chromium", // full Chromium: the lightweight headless shell cannot run extensions
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--autoplay-policy=no-user-gesture-required"],
  });
  const sarvamCalls = [];
  await ctx.route("https://api.sarvam.ai/**", async (route) => {
    const url = route.request().url();
    sarvamCalls.push({ path: url.replace("https://api.sarvam.ai", ""), key: route.request().headers()["api-subscription-key"] });
    const body = url.endsWith("/translate") ? { translated_text: "டேய் இங்க வா" } : { audios: [wavBase64()] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await ctx.route("https://www.netflix.com/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: MOCK }));
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  if (withKey) await sw.evaluate(() => chrome.storage.local.set({ sarvamKey: "FAKE-KEY" }));
  const page = await ctx.newPage();
  await page.goto("https://www.netflix.com/watch/123");
  await page.click("#b"); // a user gesture, like pressing play on Netflix
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.querySelector(".player-timedtext").textContent = "Come here, this is important."; });
  await page.waitForTimeout(2500);
  const st = (await sw.evaluate(() => chrome.storage.local.get(["status"]))).status;
  await ctx.close();
  return { sarvamCalls, st };
}

// The REAL popup page of the real extension: voice picker and free-translator lab must load
// and finish with a readable report (whatever this browser's built-in translator can do).
async function popupLab() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-popup-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: true,
    channel: "chromium",
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent("serviceworker", { timeout: 15000 });
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`chrome-extension://${id}/popup.html`);
  const voiceHint = await page.textContent("#voiceHint");
  await page.click("#lab");
  await page.waitForFunction(() => document.getElementById("labOut").textContent.includes("[Netflix page]"), null, { timeout: 150000 });
  const out = await page.textContent("#labOut");
  await ctx.close();
  return { voiceHint, out, errors };
}

(async () => {
  let r = await run(true);
  assert.deepStrictEqual(r.sarvamCalls.map((c) => c.path), ["/translate", "/text-to-speech"]);
  assert.ok(r.sarvamCalls.every((c) => c.key === "FAKE-KEY"));
  assert.strictEqual(r.st.spoken, 1, "the Tamil audio should play to the end: " + JSON.stringify(r.st));
  console.log("PASS 1. real extension: subtitle -> background -> Sarvam translate + voice -> audio played to the end");
  r = await run(false);
  assert.strictEqual(r.sarvamCalls.length, 0);
  assert.ok(/No Sarvam key/.test(r.st.note), r.st.note);
  console.log("PASS 2. real extension with no key: silent, and the status says the key is missing");
  const lab = await popupLab();
  assert.strictEqual(lab.errors.length, 0, lab.errors.join("; "));
  assert.ok(/Tamil voice|No Tamil voices/.test(lab.voiceHint), lab.voiceHint);
  assert.ok(lab.out.includes("Translator API present:") && lab.out.includes("[Popup]") && lab.out.includes("[Netflix page]"), lab.out);
  console.log("PASS 3. real popup: voice picker loads, and the free-translator lab ends with a readable report");
  console.log("   (information only) this Chromium reports:\n   " + lab.out.split("\n").slice(0, 4).join("\n   "));
  console.log("\nAll 3 end-to-end checks passed.");
})().catch((e) => { console.error("E2E FAIL:", e.message); process.exit(1); });
