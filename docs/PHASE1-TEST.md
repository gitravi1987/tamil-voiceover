# Phase 1 test guide (Edge on the desktop)

**Goal:** check that the extension reads Netflix subtitles, speaks them, and dips the volume gently. No translation yet (that is Phase 2), and no Sarvam key is needed.

## Install (about 3 minutes)
1. On the desktop open https://github.com/gitravi1987/tamil-voiceover → **Code → Download ZIP** → unzip.
2. Open Edge → `edge://extensions` → turn on **Developer mode** → **Load unpacked** → pick the `extension` folder.
3. Pin the extension (puzzle icon → pin) so the popup is one click away.

## Test A: Tamil subtitles (voice quality check, no translation needed)
1. Play a Netflix title that offers **Tamil subtitles** (check *Audio & Subtitles* menu).
2. Select Tamil subtitles. In the popup set **Mode = Tamil lines only**.
3. Expect: each Tamil line is spoken, the movie volume dips to about 25% while it speaks, then returns.

## Test B: Timing test (Interstellar, English subtitles)
1. Turn on English subtitles. In the popup set **Mode = Timing test**.
2. Expect: an English voice reads each line aloud. We only check **timing and volume dip**, not the language.

## What to send me
- The popup **status box** text (Tamil voice found? last line? note?).
- Did the voice start on time, late, or overlap the next line?
- Did the volume dip feel gentle or abrupt? Did it restore properly?
- Did nothing happen? Press F12 → Console and look for lines starting `[TamilVO]`.

## Known unknowns (I could not test these without a live Netflix account)
- Netflix's subtitle element name (`.player-timedtext`) may have changed. If no `[TamilVO] subtitle:` lines appear, tell me and I will adjust it.
- Whether Netflix lets the extension change `video.volume`.
- Whether Edge shows a Tamil voice on your PC. The status box will say "NO Tamil voice found" if not.

Brave note: Brave only offers the voices installed in Windows, so the free voice may not include Tamil there. Phase 2 uses Sarvam, which works in any browser.
