// Popup: reads and saves settings in chrome.storage.local, and shows live status.
const DEFAULTS = { enabled: true, mode: "tamil", dip: 0.25, rate: 1.0, hideSubtitles: false };
const $ = (id) => document.getElementById(id);

function render(s) {
  $("enabled").checked = s.enabled;
  $("mode").value = s.mode;
  $("dip").value = Math.round(s.dip * 100);
  $("dipVal").textContent = Math.round(s.dip * 100) + "%";
  $("rate").value = s.rate;
  $("rateVal").textContent = Number(s.rate).toFixed(2) + "x";
  $("hideSubtitles").checked = s.hideSubtitles;
}

function renderStatus(st) {
  if (!st) return;
  $("status").textContent =
    `Tamil voice: ${st.voice}\nNow: ${st.note}\nLast line: ${st.lastLine || "(none yet)"}`;
  $("status").style.whiteSpace = "pre-wrap";
}

chrome.storage.local.get({ ...DEFAULTS, status: null }, (s) => {
  render(s);
  renderStatus(s.status);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.status) renderStatus(changes.status.newValue);
});

function save() {
  const s = {
    enabled: $("enabled").checked,
    mode: $("mode").value,
    dip: Number($("dip").value) / 100,
    rate: Number($("rate").value),
    hideSubtitles: $("hideSubtitles").checked,
  };
  render(s);
  chrome.storage.local.set(s);
}

["enabled", "mode", "dip", "rate", "hideSubtitles"].forEach((id) => $(id).addEventListener("input", save));
