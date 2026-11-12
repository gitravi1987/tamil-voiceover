// Tamil Voiceover for Netflix: Phase 2.1
//
// What this does:
//   1. Watches Netflix's on-screen subtitles and notices each new line.
//   2. Mode "sarvam": each line is sent to the background worker immediately
//      (several can be in flight at once), translated into conversational Tamil
//      and voiced by Sarvam. Lines are played IN ORDER and never cut off.
//      When the voice falls behind it speeds up, skips tiny lines, drops lines
//      that are far too late, and can optionally pause the movie to catch up.
//      (Modes "tamil" and "timing" are the free Phase 1 browser-voice fallbacks.)
//   3. Gently lowers the video volume while the voice speaks, then restores it.
//
// It only reads subtitle TEXT from the page. It never touches Netflix audio/video data.
// The Sarvam API key is never read here: only background.js uses it.

(() => {
  if (window.__tamilVOLoaded) return; // avoid double-loading
  window.__tamilVOLoaded = true;

  // ---- Settings -----------------------------------------------------------
  // Netflix's subtitle container. Kept in ONE place because Netflix may change it.
  const SUBTITLE_SELECTOR = ".player-timedtext";
  const TAMIL_RE = /[஀-௿]/; // Tamil script block

  const DEFAULTS = {
    enabled: true,
    mode: "sarvam",       // "sarvam": translate + Sarvam voice | "tamil": browser voice, Tamil-script lines only | "timing": browser voice, any line
    dip: 0.25,            // movie volume while the voice speaks (25% of normal)
    rate: 1.2,            // base speaking speed (browser voice rate and Sarvam pace)
    boost: 1.0,           // loudness of the Sarvam voice (1.0 = normal)
    hideSubtitles: false, // hide the on-screen subtitle text (voice only)
    skipSoundCaptions: true, // do not voice sound descriptions like [MUSIC] or (sighs)
    browserVoice: "",     // name of the browser Tamil voice to use ("" = first Tamil voice found)
    maxLagMs: 6000,       // skip a line if it would start more than this long after its subtitle appeared
    catchUpPause: false,  // pause the movie while 2+ lines are waiting, resume when caught up
  };

  // Catch-up tuning
  const MAX_IN_FLIGHT = 3;      // Sarvam requests at the same time
  const BEHIND_MS = 2500;       // "behind" if a line starts later than this
  const SHORT_LINE_WORDS = 2;   // lines this short are skipped when behind
  const PACE_STEP = 0.15;       // +15% speed per waiting line
  const MAX_PACE = 2.0;         // Sarvam's limit

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
      const modeChanged = !!changes.mode;
      for (const key of Object.keys(DEFAULTS)) {
        if (changes[key]) settings[key] = changes[key].newValue;
      }
      applyHideSubtitles();
      if (changes.browserVoice) reportVoice();
      if (settings.boost && gainNode) gainNode.gain.value = settings.boost;
      if (!settings.enabled || modeChanged) stopAll();
      if (changes.catchUpPause && !settings.catchUpPause) releaseCatchUpPause();
    });
  }

  // ---- Status shown in the popup (so you don't need DevTools) -------------
  let status = {
    voice: "checking…", engine: "-", lastLine: "", lastTamil: "", note: "waiting for subtitles",
    spoken: 0, skipped: 0, captionsSkipped: 0, avgDelayMs: null, recent: [],
  };
  function setStatus(patch) {
    status = { ...status, ...patch };
    if (store) store.set({ status });
  }

  // ---- Browser voice (Phase 1 fallback) -----------------------------------
  function pickVoice(langPrefix) {
    const voices = window.speechSynthesis.getVoices();
    if (langPrefix === "ta" && settings.browserVoice) {
      const chosen = voices.find((v) => v.name === settings.browserVoice);
      if (chosen) return chosen; // the voice the owner picked in the popup
    }
    return voices.find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(langPrefix)) || null;
  }

  function reportVoice() {
    const v = pickVoice("ta");
    setStatus({ voice: v ? `${v.name} (${v.lang})` : "NO Tamil browser voice found" });
  }
  window.speechSynthesis.addEventListener("voiceschanged", reportVoice);
  reportVoice();

  // ---- Volume dip ---------------------------------------------------------
  let ducked = false;
  let savedVolume = 1;
  let rampTimer = null;

  function getVideo() {
    return document.querySelector("video");
  }

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
    const video = getVideo();
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

  // Safety net: if the volume is lowered but nothing is speaking for ~3 s, restore it.
  let idleTicks = 0;
  setInterval(() => {
    if (ducked && !currentSource && !current) {
      if (++idleTicks >= 3) {
        idleTicks = 0;
        duck(false);
      }
    } else {
      idleTicks = 0;
    }
  }, 1000);

  // ---- Browser voice playback ---------------------------------------------
  let current = null; // the utterance we are currently speaking

  function stopBrowserVoice() {
    current = null;
    window.speechSynthesis.cancel();
  }

  function speakBrowser(text, langPrefix) {
    window.speechSynthesis.cancel(); // newest line wins (browser modes only)
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

  // ---- Sarvam: ordered queue ----------------------------------------------
  let audioCtx = null;
  let gainNode = null;
  let currentSource = null;
  const queue = [];   // lines waiting to be played, in subtitle order
  let playing = null; // the line being played now
  let epoch = 0;      // bumps on seek / stop, so old answers are ignored
  let selfPaused = false; // true while WE paused the movie to catch up

  const ERROR_NOTES = {
    no_key: "No Sarvam key yet. Open the popup and save your key.",
    invalid_key: "Sarvam rejected the key (403). Check or re-save it in the popup.",
    forbidden: "Sarvam refused the request (403).",
    no_credits: "Out of Sarvam credits. Top up on the Sarvam dashboard.",
    rate_limited: "Sarvam rate limit hit (429). Skipping this line.",
    cap: "Spending cap reached. Raise the cap in the popup to continue.",
    network: "Could not reach Sarvam (network).",
    server: "Sarvam server error. Skipping this line.",
  };

  const words = (t) => t.split(/\s+/).filter(Boolean).length;
  const now = () => performance.now();

  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioCtx.createGain();
      gainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    gainNode.gain.value = settings.boost;
  }

  function stopSarvamAudio() {
    const src = currentSource;
    currentSource = null; // clear first so its "ended" event is ignored
    if (src) {
      try { src.stop(); } catch (e) { /* already stopped */ }
    }
  }

  function stopAll() {
    epoch++;
    queue.length = 0;
    playing = null;
    stopBrowserVoice();
    stopSarvamAudio();
    duck(false);
    releaseCatchUpPause();
  }

  // Add a line and start its Sarvam request right away (up to MAX_IN_FLIGHT at once).
  function enqueue(text, isTamil) {
    const waiting = queue.length + (playing ? 1 : 0);
    const pace = Math.min(MAX_PACE, settings.rate * (1 + PACE_STEP * waiting));
    queue.push({ text, isTamil, pace, epoch, appearedAt: now(), state: "queued", resp: null });
    startFetches();
    maybeCatchUpPause();
  }

  function startFetches() {
    let inFlight = queue.filter((j) => j.state === "fetching").length;
    for (const job of queue) {
      if (inFlight >= MAX_IN_FLIGHT) break;
      if (job.state !== "queued") continue;
      job.state = "fetching";
      inFlight++;
      Promise.resolve()
        .then(() => chrome.runtime.sendMessage({ type: "line", text: job.text, skipTranslate: job.isTamil, pace: job.pace }))
        .catch(() => ({ ok: false, error: "network" }))
        .then((resp) => {
          job.resp = resp || { ok: false, error: "network" };
          job.state = "ready";
          job.readyAt = now();
          if (job.epoch !== epoch) return;
          startFetches();
          pump();
        });
    }
  }

  function skip(job, why) {
    status.skipped++;
    setStatus({ skipped: status.skipped, note: `skipped: ${why}` });
    console.log("[TamilVO] skipped:", why, "|", job.text);
  }

  // Play the next line if nothing is playing and the next line is ready.
  function pump() {
    if (playing) return;
    while (queue.length) {
      const job = queue[0];
      if (job.epoch !== epoch) { queue.shift(); continue; }
      if (job.state !== "ready") break; // keep order: wait for this one
      queue.shift();
      const lag = now() - job.appearedAt;
      if (!job.resp.ok) {
        skip(job, ERROR_NOTES[job.resp.error] || "Sarvam error");
        continue;
      }
      if (lag > settings.maxLagMs) {
        skip(job, `too far behind (${Math.round(lag)} ms)`);
        continue;
      }
      const behind = lag > BEHIND_MS || queue.length >= 2;
      if (behind && words(job.text) <= SHORT_LINE_WORDS) {
        skip(job, "short line while behind");
        continue;
      }
      playJob(job);
      break;
    }
    if (!queue.length) releaseCatchUpPause();
  }

  async function playJob(job) {
    playing = job;
    job.startedAt = now();
    setStatus({ engine: "Sarvam", lastTamil: job.resp.tamil, note: "speaking Tamil (Sarvam)" });
    try {
      ensureAudio();
      const bytes = Uint8Array.from(atob(job.resp.audio), (c) => c.charCodeAt(0));
      const buffer = await audioCtx.decodeAudioData(bytes.buffer);
      if (job.epoch !== epoch || playing !== job) return; // stopped while decoding
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(gainNode);
      src.onended = () => {
        if (currentSource !== src) return;
        currentSource = null;
        finish(job);
      };
      currentSource = src;
      duck(true);
      src.start();
    } catch (e) {
      if (playing === job) playing = null;
      skip(job, "could not play audio: " + e.message);
      pump();
      if (!playing) duck(false);
    }
  }

  function finish(job) {
    playing = null;
    const r = job.resp;
    const timing = {
      line: job.text.slice(0, 40),
      translateMs: r.translateMs || 0,
      voiceMs: r.ttsMs || 0,
      waitMs: Math.round(job.startedAt - job.readyAt),
      totalMs: Math.round(job.startedAt - job.appearedAt),
      pace: +job.pace.toFixed(2),
      cached: !!r.cached,
    };
    const recent = [...status.recent, timing].slice(-20);
    const avg = Math.round(recent.reduce((a, t) => a + t.totalMs, 0) / recent.length);
    setStatus({ spoken: status.spoken + 1, recent, avgDelayMs: avg });
    pump();
    if (!playing) duck(false); // only restore if nothing follows straight away
  }

  // ---- Optional: pause the movie to let the voice catch up ----------------
  function maybeCatchUpPause() {
    if (!settings.catchUpPause) return;
    const video = getVideo();
    if (!video || video.paused) return;
    if (queue.length >= 2) {
      selfPaused = true;
      video.pause();
      setStatus({ note: "paused the movie to let the Tamil voice catch up" });
    }
  }

  function releaseCatchUpPause() {
    if (!selfPaused) return;
    selfPaused = false;
    const video = getVideo();
    if (video && video.paused) {
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    }
  }

  // ---- Handling each subtitle line ---------------------------------------
  // Subtitles for deaf viewers also describe sounds: "[ BREATHES DEEPLY ]", "(sighs)", "♪ ... ♪".
  // Nobody wants those read aloud (and in Sarvam mode they cost money), so strip them.
  // "[GROANS] Come on!" keeps only "Come on!".
  function cleanCaption(raw) {
    return raw
      .replace(/\[[^\]]*\]/g, " ")       // [ BREATHES DEEPLY ], [MUSIC]
      .replace(/\[[^\]]*$/g, " ")        // a bracket that never closes
      .replace(/\([^)]*\)/g, " ")        // (sighs)
      .replace(/[♪♫][^♪♫]*[♪♫]?/g, " ")    // ♪ music or sung lyrics ♪
      .replace(/\s+/g, " ")
      .replace(/^[\s\-–—:,.;!?…]+/, "")    // leftover punctuation or a leading dash
      .trim();
  }

  function handleLine(rawText) {
    console.log("[TamilVO] subtitle:", rawText);
    setStatus({ lastLine: rawText });
    if (!settings.enabled) return setStatus({ note: "paused (switched off)" });

    let text = rawText;
    if (settings.skipSoundCaptions) {
      text = cleanCaption(rawText);
      if (!/[\p{L}\p{N}]/u.test(text)) { // nothing left to say
        return setStatus({ captionsSkipped: (status.captionsSkipped || 0) + 1, note: "sound-description caption skipped" });
      }
    }

    const isTamil = TAMIL_RE.test(text);
    if (settings.mode === "sarvam") {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
        return setStatus({ note: "extension runtime unavailable; reload the page" });
      }
      return enqueue(text, isTamil);
    }
    if (settings.mode === "tamil") {
      if (!isTamil) return setStatus({ engine: "browser", note: "English line skipped in this mode. Switch to Sarvam mode." });
      setStatus({ engine: "browser", note: "speaking Tamil line" });
      speakBrowser(text, "ta");
    } else {
      setStatus({ engine: "browser", note: "timing test: speaking line" });
      speakBrowser(text, isTamil ? "ta" : "en");
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
    const video = getVideo();
    if (!video || watchedVideos.has(video)) return;
    watchedVideos.add(video);
    video.addEventListener("pause", () => {
      if (selfPaused) return; // our own catch-up pause: keep the Tamil voice going
      window.speechSynthesis.pause();
      if (audioCtx && audioCtx.state === "running") audioCtx.suspend();
      duck(false);
    });
    video.addEventListener("play", () => {
      if (selfPaused) selfPaused = false; // the viewer pressed play during a catch-up pause
      window.speechSynthesis.resume();
      if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
      if (window.speechSynthesis.speaking || currentSource) duck(true);
    });
    video.addEventListener("seeking", () => {
      stopAll();
      lastLine = "";
    });
  }

  // ---- Free tools lab: the popup asks this page to test the built-in translator here ----
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || msg.type !== "lab-translator") return false;
      globalThis.TamilVOLab.runTranslatorLab("Netflix page").then(sendResponse);
      return true; // answer arrives later
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
