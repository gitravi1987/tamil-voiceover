// Tamil Voiceover — Phase 0 stub.
// Watches Netflix's on-screen subtitles and logs each new line.
// No translation or voice yet; that arrives in Phase 1/2.

// Netflix's subtitle container. Kept in one place because Netflix may change it.
const SUBTITLE_SELECTOR = ".player-timedtext";

let lastLine = "";

function readSubtitle() {
  const box = document.querySelector(SUBTITLE_SELECTOR);
  if (!box) return;
  const text = box.innerText.trim().replace(/\s+/g, " ");
  if (text && text !== lastLine) {
    lastLine = text;
    console.log("[TamilVO] subtitle:", text);
  }
}

// Netflix is a single-page app, so observe the whole body for subtitle changes.
new MutationObserver(readSubtitle).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

console.log("[TamilVO] loaded — waiting for subtitles…");
