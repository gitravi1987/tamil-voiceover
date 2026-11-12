// Free tools lab: shared by the popup and the Netflix-page script (listed first in
// manifest.json so content.js can use it).
//
// Question it answers: can THIS browser translate English -> Tamil for free, with the
// built-in Translator API (on-device, no account, no key)? And how spoken or formal is
// the Tamil it produces? It translates a few movie-style sentences and times each one.
//
// Nothing here costs money or leaves the browser.

(() => {
  const SENTENCES = [
    "Come on, we're out of time.",
    "I don't know what you're talking about.",
    "Get out of here, now!",
    "Please, just listen to me for a second.",
    "Where are you going? Don't leave me here.",
    "That's the best news I've heard all day.",
  ];

  // A stuck model download must not freeze the lab: give up after a while and say so.
  function withTimeout(promise, ms, what) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(`${what} took longer than ${Math.round(ms / 1000)} s`), { name: "Timeout" })), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  async function runTranslatorLab(where, limits = {}) {
    const { availabilityMs = 15000, createMs = 120000, translateMs = 20000 } = limits;
    const report = { where, hasTranslator: false, availability: null, createMs: null, ready: false, results: [], error: null };
    try {
      report.hasTranslator = typeof Translator !== "undefined";
      if (!report.hasTranslator) {
        report.error = "The built-in Translator API does not exist here.";
        return report;
      }
      const opts = { sourceLanguage: "en", targetLanguage: "ta" };
      report.availability = String(await withTimeout(Translator.availability(opts), availabilityMs, "Checking availability"));
      if (report.availability === "unavailable" || report.availability === "no") {
        report.error = "English to Tamil is not supported by this browser's built-in translator.";
        return report;
      }
      const t0 = performance.now();
      const translator = await withTimeout(Translator.create(opts), createMs, "Preparing the translator (a language model may be downloading)"); // may download a language model the first time
      report.createMs = Math.round(performance.now() - t0);
      for (const english of SENTENCES) {
        const a = performance.now();
        const tamil = await withTimeout(translator.translate(english), translateMs, "Translating one sentence");
        report.results.push({ english, tamil, ms: Math.round(performance.now() - a) });
      }
      report.ready = true;
    } catch (e) {
      report.error = `${e.name || "Error"}: ${e.message}`;
    }
    return report;
  }

  globalThis.TamilVOLab = { SENTENCES, runTranslatorLab };
})();
