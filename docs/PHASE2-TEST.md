# Phase 2 test guide (Sarvam voice on Netflix)

**Goal:** hear English Netflix lines in conversational Tamil with the Sarvam voice, and check delay, voice quality, volume and cost.

## 1. Update the extension (3 minutes)
1. Download the repo ZIP again (**Code -> Download ZIP**) and unzip it, preferably into a new folder.
2. In Edge open `edge://extensions`. Remove the old Tamil Voiceover, then **Load unpacked** and pick the new **`extension`** folder (the one that contains `manifest.json`).
3. The popup title area should now show the new popup with a **Sarvam key** section.

## 2. Add your key and a safety cap
1. Open the popup, paste your Sarvam key into **Sarvam key**, click **Save key**. The box clears and says **Key saved**.
2. Set **Stop at** under *Spending* to **90** (you have about Rs 99). The extension will stop calling Sarvam before your credit runs out.
3. Set **Mode = Sarvam voice (translate + speak)**.

## 3. Check the voice
1. Click **Speak sample**. You should hear a Tamil sentence.
2. Not the voice you liked in the Sarvam playground? In the playground open the **Code** tab, copy the exact `speaker` value, and paste it into **Custom speaker ID** in the popup. (Our default, `simran_en_conversation`, is a guess.)

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
