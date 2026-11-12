# Free tools lab: what to do on your desktop (v0.2.2)

Cost: Rs 0. Nothing here calls Sarvam.

## Update (do NOT click Remove: it deletes your saved settings)
1. Download the repo ZIP (**Code -> Download ZIP**) and unzip it.
2. Copy everything from its `extension` folder **over** the files in your fixed extension folder (replace when asked). There is one new file, `lab.js`.
3. In `edge://extensions` click the **reload arrow** on the Tamil Voiceover card.
4. Reload your Netflix tab (Ctrl+Shift+R).

## Test 1: Tamil voices (1 minute)
1. Open the popup. Find **Free Tamil voice (from your browser)**.
2. Open the **Tamil voice** list. Note every voice listed (for example Pallavi, Valluvar, Saranya).
3. Pick one and press **Test voice**. You should hear a Tamil sentence.
4. Try each voice and tell me which you like. Your choice is also used on Netflix.

## Test 2: Can Edge translate English to Tamil for free? (2 minutes)
1. Keep a **Netflix tab active** (so the lab can test inside the page too). Open the popup.
2. Under **Free tools lab** press **Check free translator**.
3. The first run may download a small language model: wait up to two minutes. You need internet.
4. You will see, for the popup and for the Netflix page: whether the translator exists, `availability`, and six English sentences with their Tamil and the time each took.
5. **Read the Tamil.** Is it **spoken, everyday Tamil** (like "நீ எங்க போற?") or **formal book Tamil**? That is the most important answer.

## Send me
Press **Copy diagnostics** and paste it in the chat. It contains the lab result and the Tamil voices your browser has, never your key. Also tell me:
- Which Tamil voices you liked.
- Whether the Tamil from the translator sounded spoken or formal, and which sentences were wrong.

## Why this matters
If the built-in translator works and sounds good enough, the whole voiceover can be free. If not, the next options are in `docs/VOICE-OPTIONS.md`.

## New in v0.2.3: sound descriptions are no longer read aloud
Subtitles for deaf viewers include lines like `[ BREATHES DEEPLY ]`, `(sighs)` and `♪ ... ♪`. They are now skipped (so they are not voiced and, in Sarvam mode, not paid for). `[GROANS] Come on!` becomes just `Come on!`. The popup has a checkbox **Skip sound descriptions like [MUSIC] or (sighs)** (on by default) and the status shows how many were skipped. Update the same way as above (copy files over the folder, press the reload arrow).
