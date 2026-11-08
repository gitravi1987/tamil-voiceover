// Tamil Voiceover for Netflix: Phase 1
//
// What this does:
//   1. Watches Netflix's on-screen subtitles and notices each new line.
//   2. Speaks the line with the browser's built-in voice (free, no API).
//   3. Gently lowers the video volume while the voice speaks, then restores it.
//
// What it does NOT do yet (Phase 2): translate English -> conversational Tamil
// and use the Sarvam voice. Until then, "tamil" mode speaks only lines that are
// already Tamil (i.e. when you pick Tamil subtitles in Netflix).
//
// It only reads subtitle TEXT from the page. It never touches Netflix audio/video data.

(() => {
  if (window.__tamilVOLoaded) return; // avoid double-loading
  window.__tamilVOLoaded = true;

  // ---- Settings -----------------------------------------------------------
  // Netflix's subtitle container. Kept in ONE place because Netflix may change it.
  const SUBTITLE_SELECTOR = ".player-timedtext";
  const TAMIL_RE = /[஀-௿]/; // Tamil script block

  const DEFAULTS = {
    enabled: true,
    mode: "tamil",        // "tamil": speak only Tamil-script lines | "timing": speak any line (English voice for English) to test timing/volume dip
    dip: 0.25,            // video volume while the voice speaks (25% of normal)
    rate: 1.0,            // speaking speed
    hideSubtitles: false, // hide the on-screen subtitle text (voice only)
  };

  let settings = { ...DEFAULTS };

  // ---- Hide on-screen subtitles (optional) -------------------------------
  const styleEl = document.createElement("style");
  styleEl.textContent = `${SUBTITLE_SELECTOR}{opacity:0 !important}`;
  function applyHideSubtitles() {
    if (settings.hideSubtitles) {
      if (!styleEl.isConnected) document.documentElement.appendChild(styleEl);
    } else {
      styleEl.remove();
    }
  }

  const store = typeof chrome !== "undefined" && chrome.storage && chrome.storage.local ? chrome.storage.local : null;

  if (store) {
    store.get(DEFAULTS, (s) => {
      settings = { ...DEFAULTS, ...s };
      applyHideSubtitles();
    });
    chrome.storage.onChanged.addListener((changes) => {
      for (const key of Object.keys(DEFAULTS)) {
        if (changes[key]) settings[key] = changes[key].newValue;
      }
      applyHideSubtitles();
      if (!settings.enabled) stopSpeaking();
    });
  }

  // ---- Status shown in the popup (so you don't need DevTools) -------------
  let status = { voice: "checking…", lastLine: "", note: "waiting for subtitles" };
  function setStatus(patch) {
    status = { ...status, ...patch };
    if (store) store.set({ status });
  }

  // ---- Voice --------------------------------------------------------------
  function pickVoice(langPrefix) {
    const voices = window.speechSynthesis.getVoices();
    return voices.find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(langPrefix)) || null;
  }

  function reportVoice() {
    const v = pickVoice("ta");
    setStatus({ voice: v ? `${v.name} (${v.lang})` : "NO Tamil voice found in this browser" });
  }
  window.speechSynthesis.addEventListener("voiceschanged", reportVoice);
  reportVoice();

  // ---- Volume dip ---------------------------------------------------------
  let ducked = false;
  let savedVolume = 1;
  let rampTimer = null;

  function rampVolume(video, target, done) {
    clearInterval(rampTimer);
    const start = video.volume;
    const steps = 6; // ~120 ms total: quick but not a click
    let i = 0;
    rampTimer = setInterval(() => {
      i++;
      video.volume = Math.min(1, Math.max(0, start + ((target - start) * i) / steps));
      if (i >= steps) {
        clearInterval(rampTimer);
        if (done) done();
      }
    }, 20);
  }

  function duck(on) {
    const video = document.querySelector("video");
    if (!video) return;
    if (on) {
      if (!ducked) {
        savedVolume = video.volume;
        ducked = true;
      }
      rampVolume(video, savedVolume * settings.dip);
    } else if (ducked) {
      rampVolume(video, savedVolume, () => {
        ducked = false;
      });
    }
  }

  // ---- Speaking -----------------------------------------------------------
  let current = null; // the utterance we are currently speaking

  function stopSpeaking() {
    current = null;
    window.speechSynthesis.cancel();
    duck(false);
  }

  function speak(text, langPrefix) {
    window.speechSynthesis.cancel(); // newest line wins
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice(langPrefix);
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    } else {
      u.lang = langPrefix === "ta" ? "ta-IN" : "en-US";
    }
    u.rate = settings.rate;
    current = u;
    // Ignore events from an utterance we already replaced.
    u.onstart = () => current === u && duck(true);
    u.onend = u.onerror = () => {
      if (current === u) {
        current = null;
        duck(false);
      }
    };
    window.speechSynthesis.speak(u);
  }

  // ---- Handling each subtitle line ---------------------------------------
  function handleLine(text) {
    console.log("[TamilVO] subtitle:", text);
    setStatus({ lastLine: text });
    if (!settings.enabled) return setStatus({ note: "paused (switched off)" });

    const isTamil = TAMIL_RE.test(text);
    if (settings.mode === "tamil") {
      if (!isTamil) {
        return setStatus({ note: "English line skipped. Pick Tamil subtitles, or wait for Phase 2 (translation)." });
      }
      setStatus({ note: "speaking Tamil line" });
      speak(text, "ta");
    } else {
      setStatus({ note: "timing test: speaking line" });
      speak(text, isTamil ? "ta" : "en");
    }
  }

  // ---- Reading the subtitle box ------------------------------------------
  let lastLine = "";
  let debounce = null;

  function readSubtitle() {
    const box = document.querySelector(SUBTITLE_SELECTOR);
    const text = box ? box.innerText.replace(/\s+/g, " ").trim() : "";
    if (!text) {
      lastLine = ""; // so the same line can be spoken again later
      return;
    }
    if (text === lastLine) return;
    lastLine = text;
    handleLine(text);
  }

  // ---- Follow play / pause / seek ----------------------------------------
  const watchedVideos = new WeakSet();
  function watchVideo() {
    const video = document.querySelector("video");
    if (!video || watchedVideos.has(video)) return;
    watchedVideos.add(video);
    video.addEventListener("pause", () => {
      window.speechSynthesis.pause();
      duck(false);
    });
    video.addEventListener("play", () => {
      window.speechSynthesis.resume();
      if (window.speechSynthesis.speaking) duck(true);
    });
    video.addEventListener("seeking", () => {
      stopSpeaking();
      lastLine = "";
    });
  }

  // ---- Start --------------------------------------------------------------
  // Netflix is a single-page app, so watch the page for subtitle changes.
  // The short debounce stops flicker (text briefly vanishing and returning)
  // from speaking the same line twice.
  new MutationObserver(() => {
    watchVideo();
    clearTimeout(debounce);
    debounce = setTimeout(readSubtitle, 80);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });

  console.log("[TamilVO] loaded; waiting for subtitles…");
  setStatus({ note: "loaded; waiting for subtitles" });
})();
