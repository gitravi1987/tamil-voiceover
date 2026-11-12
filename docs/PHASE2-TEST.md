# Phase 2 test guide (Sarvam voice on Netflix), updated for v0.2.1

**Goal:** hear English Netflix lines in conversational Tamil with the Sarvam voice, and check delay, voice quality, volume and cost.

## 1. Update the extension (3 minutes)
**Important: do not click Remove when updating.** Removing the extension deletes your saved key and settings.
1. Keep the extension in one fixed folder, for example `Documents\tamil-voiceover\extension`.
2. To update: download the repo ZIP (**Code -> Download ZIP**), unzip it, and copy the files from its `extension` folder **over** the files in your fixed folder (replace them).
3. In Edge open `edge://extensions` and click the **reload arrow** on the Tamil Voiceover card. Your key and settings stay.
4. Reload the Netflix tab (Ctrl+Shift+R).

First install only: **Load unpacked** and pick the fixed `extension` folder (the one that contains `manifest.json`).

## 2. Add your key and a safety cap
1. Open the popup, paste your Sarvam key into **Sarvam key**, click **Save key**. The box clears and says **Key saved**.
2. Set **Stop at** under *Spending* to **90** (you have about Rs 99). The extension will stop calling Sarvam before your credit runs out.
3. Set **Mode = Sarvam voice (translate + speak)**.

## 3. Check the voice
1. Click **Speak sample**. You should hear a Tamil sentence.
2. The default voice is **Gokul** (Tamil narration, male). To try another, pick it in the **Voice** list. For a voice that is not in the list, open the Sarvam playground **Code** tab, copy the exact `speaker` value, and paste it into **Custom speaker ID**. If the Voice list still shows another voice after updating, pick Gokul once: the popup remembers whatever it saved before.

## 4. Watch
1. Open Interstellar with **English subtitles** and **reload the Netflix tab** (Ctrl+Shift+R) so the new extension attaches.
2. Watch 3 to 5 minutes of a dialogue scene. Optional: tick **Hide on-screen subtitles**.
3. Try the **Movie volume while voice speaks** slider (higher keeps more music, but more English underneath).

## 5. Report back
Click **Copy diagnostics** (it never includes your key) and paste it in the chat, plus:
- Does the Tamil sound natural and conversational, or stiff?
- Delay: does the Tamil start with the subtitle or noticeably late? (The diagnostics show the delay in ms.)
- Any lines skipped, repeated, or out of order?
- Volume: gentle or abrupt? Is the music loss acceptable?
- The **Estimated spend** shown after your 5 minutes.

## Notes
- Cost is an estimate from Sarvam's price list: translate Rs 2 plus voice Rs 2 per 1,000 characters.
- Sarvam allows 60 requests per minute per service on pay-as-you-go. Very fast dialogue may hit this; the popup status will say so.
- If the status says the key was rejected (403), re-save the key. If it says out of credits, top up on the Sarvam dashboard.

## Re-test after v0.2.1 (pacing fix)
v0.2.1 stops cutting lines off: lines play in order, the voice speeds up when behind, tiny lines are skipped when behind, and requests run in parallel. Use the **same fast scene** as before.
1. Update the extension as in step 1 above (copy over the files, click the reload arrow; do **not** remove it) and reload the Netflix tab.
2. Watch 2 to 3 minutes with the default speed (1.2x). Then try speed **1.4** and the **Aravind (Tamil suspense)** voice, which may be livelier than Gokul's narration style.
3. Optional: tick **Pause movie to let the voice catch up** for one run, to see if stop-and-go is acceptable for the family.
4. Click **Copy diagnostics** and paste it in the chat. It now includes, for the last 20 lines: translate ms, voice ms, waited ms, total delay and speed. These numbers decide the next fix.
