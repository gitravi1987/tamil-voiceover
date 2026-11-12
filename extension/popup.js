// Popup: reads and saves settings in chrome.storage.local, plays a sample,
// shows the spending counter and live status, and copies diagnostics.
// The Sarvam key is write-only here: it is saved, but never displayed or copied.

const DEFAULTS = {
  enabled: true, mode: "sarvam", dip: 0.25, rate: 1.2, boost: 1.0, hideSubtitles: false, catchUpPause: false,
  browserVoice: "", model: "bulbul:v4-flash", speaker: "gokul_ta_narration", customSpeaker: "", capRupees: 150,
  usage: { translateChars: 0, ttsChars: 0, rupees: 0 },
};
const $ = (id) => document.getElementById(id);
const note = (t) => { $("msg").textContent = t; };
const SAMPLE_TAMIL = "டேய், இங்க வா! இது ரொம்ப முக்கியம்.";
let currentBrowserVoice = "";

function renderUsage(u) {
  u = u || DEFAULTS.usage;
  $("usage").textContent =
    `Translated: ${u.translateChars} chars\nVoiced: ${u.ttsChars} chars\nEstimated spend: ₹${Number(u.rupees).toFixed(2)}`;
}

// Slider labels only (used while dragging, so the spending box is left alone).
function renderLabels(s) {
  $("dipVal").textContent = Math.round(s.dip * 100) + "%";
  $("rateVal").textContent = Number(s.rate).toFixed(2) + "x";
  $("boostVal").textContent = Number(s.boost).toFixed(1) + "x";
}

function render(s) {
  $("enabled").checked = s.enabled;
  $("mode").value = s.mode;
  $("model").value = s.model;
  $("speaker").value = s.speaker;
  $("customSpeaker").value = s.customSpeaker;
  $("dip").value = Math.round(s.dip * 100);
  $("rate").value = s.rate;
  $("boost").value = s.boost;
  renderLabels(s);
  $("hideSubtitles").checked = s.hideSubtitles;
  $("catchUpPause").checked = s.catchUpPause;
  $("capRupees").value = s.capRupees;
  renderUsage(s.usage);
}

function renderStatus(st) {
  if (!st) return;
  $("status").textContent =
    `Voice engine: ${st.engine}\nBrowser Tamil voice: ${st.voice}\nNow: ${st.note}\n` +
    `Last line: ${st.lastLine || "(none yet)"}\nTamil: ${st.lastTamil || "(none yet)"}\n` +
    `Spoken: ${st.spoken || 0} | Skipped: ${st.skipped || 0} | Avg delay: ${st.avgDelayMs == null ? "-" : st.avgDelayMs + " ms"}` +
    (st.recent && st.recent.length
      ? (() => { const t = st.recent[st.recent.length - 1];
          return `\nTiming: translate ${t.translateMs} ms, voice ${t.voiceMs} ms, waited ${t.waitMs} ms, total ${t.totalMs} ms, speed ${t.pace}x`; })()
      : "");
}

function renderKeyState(hasKey) {
  $("keyState").textContent = hasKey ? "Key saved ✓" : "⚠ No key saved: the Sarvam voice stays silent until you save your key.";
  $("keyState").style.color = hasKey ? "" : "#b00020";
  $("keyState").style.fontWeight = hasKey ? "" : "600";
}

chrome.storage.local.get({ ...DEFAULTS, status: null, sarvamKey: "" }, (s) => {
  currentBrowserVoice = s.browserVoice;
  render(s);
  renderVoices();
  renderStatus(s.status);
  renderKeyState(!!s.sarvamKey);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.status) renderStatus(changes.status.newValue);
  if (changes.usage) renderUsage(changes.usage.newValue);
});

function save() {
  const s = {
    enabled: $("enabled").checked,
    mode: $("mode").value,
    browserVoice: $("browserVoice").value,
    model: $("model").value,
    speaker: $("speaker").value,
    customSpeaker: $("customSpeaker").value.trim(),
    dip: Number($("dip").value) / 100,
    rate: Number($("rate").value),
    boost: Number($("boost").value),
    hideSubtitles: $("hideSubtitles").checked,
    catchUpPause: $("catchUpPause").checked,
    capRupees: Number($("capRupees").value) || 0,
  };
  renderLabels(s);
  chrome.storage.local.set(s);
}

["enabled", "mode", "browserVoice", "model", "speaker", "customSpeaker", "dip", "rate", "boost", "hideSubtitles", "catchUpPause", "capRupees"]
  .forEach((id) => $(id).addEventListener("input", save));

// ---- key (write-only) ----
$("saveKey").addEventListener("click", () => {
  const key = $("key").value.trim();
  if (!key) return note("Paste your key first.");
  chrome.storage.local.set({ sarvamKey: key }, () => {
    $("key").value = ""; // clear the box so the key is not left on screen
    renderKeyState(true);
    note("Key saved.");
  });
});
$("removeKey").addEventListener("click", () => {
  chrome.storage.local.remove("sarvamKey", () => { renderKeyState(false); note("Key removed."); });
});

// ---- sample ----
$("sample").addEventListener("click", async () => {
  note("Asking Sarvam…");
  const resp = await chrome.runtime.sendMessage({ type: "sample" });
  if (!resp || !resp.ok) return note("Sample failed: " + ((resp && resp.error) || "unknown"));
  const ctx = new AudioContext();
  const gain = ctx.createGain();
  gain.gain.value = Number($("boost").value);
  gain.connect(ctx.destination);
  const bytes = Uint8Array.from(atob(resp.audio), (c) => c.charCodeAt(0));
  const src = ctx.createBufferSource();
  src.buffer = await ctx.decodeAudioData(bytes.buffer);
  src.connect(gain);
  src.start();
  note("Playing: " + resp.tamil);
});

// ---- spending ----
$("resetUsage").addEventListener("click", () => {
  chrome.storage.local.set({ usage: { translateChars: 0, ttsChars: 0, rupees: 0 } }, () => note("Counter reset."));
});

// ---- diagnostics (never includes the key) ----
$("copyDiag").addEventListener("click", () => {
  chrome.storage.local.get({ ...DEFAULTS, status: null, sarvamKey: "", lab: null }, async (s) => {
    const { sarvamKey, ...safe } = s;
    safe.tamilVoicesSeenHere = tamilVoices().map((v) => `${v.name} (${v.lang})`);
    safe.hasKey = !!sarvamKey;
    safe.version = chrome.runtime.getManifest().version;
    safe.browser = navigator.userAgent;
    try {
      await navigator.clipboard.writeText(JSON.stringify(safe, null, 2));
      note("Diagnostics copied. Paste them in the chat.");
    } catch (e) {
      note("Could not copy automatically.");
    }
  });
});

// ---- free Tamil voice picker (voices come from the browser, so this costs nothing) ----
function tamilVoices() {
  return (window.speechSynthesis ? window.speechSynthesis.getVoices() : [])
    .filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ta"));
}

function renderVoices() {
  const sel = $("browserVoice");
  const voices = tamilVoices();
  sel.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = "Auto (first Tamil voice found)";
  sel.appendChild(auto);
  for (const v of voices) {
    const o = document.createElement("option");
    o.value = v.name;
    o.textContent = `${v.name} (${v.lang})`;
    sel.appendChild(o);
  }
  sel.value = voices.some((v) => v.name === currentBrowserVoice) ? currentBrowserVoice : "";
  $("voiceHint").textContent = voices.length
    ? `${voices.length} Tamil voice(s) found in this browser.`
    : "No Tamil voices found yet. They can take a few seconds to appear: close and reopen this popup.";
}

if (window.speechSynthesis) window.speechSynthesis.addEventListener("voiceschanged", renderVoices);
$("browserVoice").addEventListener("input", () => { currentBrowserVoice = $("browserVoice").value; });
renderVoices();

$("testVoice").addEventListener("click", () => {
  const voices = tamilVoices();
  const v = voices.find((x) => x.name === $("browserVoice").value) || voices[0];
  const u = new SpeechSynthesisUtterance(SAMPLE_TAMIL);
  if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = "ta-IN"; }
  u.rate = Number($("rate").value) || 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  note(v ? `Speaking with ${v.name} (${v.lang})` : "No Tamil voice found; trying the browser default.");
});

// ---- free tools lab: can this browser translate English -> Tamil for free? ----
function formatLab(r) {
  const lines = [`[${r.where}]`];
  lines.push(`Translator API present: ${r.hasTranslator ? "yes" : "no"}`);
  if (r.availability) lines.push(`English -> Tamil availability: ${r.availability}`);
  if (r.createMs != null) lines.push(`Ready in: ${r.createMs} ms`);
  for (const x of r.results) lines.push(`${x.english}\n   -> ${x.tamil}  (${x.ms} ms)`);
  if (r.error) lines.push(`Problem: ${r.error}`);
  return lines.join("\n");
}

async function askNetflixPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !/netflix\.com/.test(tab.url || "")) {
      return { where: "Netflix page", hasTranslator: false, results: [], error: "Not tested: the active tab is not a Netflix tab." };
    }
    return await chrome.tabs.sendMessage(tab.id, { type: "lab-translator" });
  } catch (e) {
    return { where: "Netflix page", hasTranslator: false, results: [], error: "Not tested: " + e.message };
  }
}

$("lab").addEventListener("click", async () => {
  $("labOut").textContent = "Testing… the first run may download a small language model, so wait up to a minute.";
  const popup = await TamilVOLab.runTranslatorLab("Popup");
  $("labOut").textContent = formatLab(popup) + "\n\n(testing the Netflix page…)";
  const page = await askNetflixPage();
  $("labOut").textContent = formatLab(popup) + "\n\n" + formatLab(page);
  chrome.storage.local.set({ lab: { popup, page } });
});
