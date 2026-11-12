// Popup: reads and saves settings in chrome.storage.local, plays a sample,
// shows the spending counter and live status, and copies diagnostics.
// The Sarvam key is write-only here: it is saved, but never displayed or copied.

const DEFAULTS = {
  enabled: true, mode: "sarvam", dip: 0.25, rate: 1.0, boost: 1.0, hideSubtitles: false,
  model: "bulbul:v4-flash", speaker: "gokul_ta_narration", customSpeaker: "", capRupees: 150,
  usage: { translateChars: 0, ttsChars: 0, rupees: 0 },
};
const $ = (id) => document.getElementById(id);
const note = (t) => { $("msg").textContent = t; };

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
  $("capRupees").value = s.capRupees;
  renderUsage(s.usage);
}

function renderStatus(st) {
  if (!st) return;
  $("status").textContent =
    `Voice engine: ${st.engine}\nBrowser Tamil voice: ${st.voice}\nNow: ${st.note}\n` +
    `Last line: ${st.lastLine || "(none yet)"}\nTamil: ${st.lastTamil || "(none yet)"}\n` +
    `Delay: ${st.latencyMs == null ? "-" : st.latencyMs + " ms"}`;
}

function renderKeyState(hasKey) {
  $("keyState").textContent = hasKey ? "Key saved ✓" : "No key saved yet";
}

chrome.storage.local.get({ ...DEFAULTS, status: null, sarvamKey: "" }, (s) => {
  render(s);
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
    model: $("model").value,
    speaker: $("speaker").value,
    customSpeaker: $("customSpeaker").value.trim(),
    dip: Number($("dip").value) / 100,
    rate: Number($("rate").value),
    boost: Number($("boost").value),
    hideSubtitles: $("hideSubtitles").checked,
    capRupees: Number($("capRupees").value) || 0,
  };
  renderLabels(s);
  chrome.storage.local.set(s);
}

["enabled", "mode", "model", "speaker", "customSpeaker", "dip", "rate", "boost", "hideSubtitles", "capRupees"]
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
  chrome.storage.local.get({ ...DEFAULTS, status: null, sarvamKey: "" }, async (s) => {
    const { sarvamKey, ...safe } = s;
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
