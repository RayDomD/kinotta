Reads: `../SKILL.md` and the reel.
Does: Inspect stills and readability, then run `kinotta check <slug>`.
Writes: Check findings and reel notes.
Owner's check: Review the checked reel.

## 6. Check stills on the key words and every beat

```bash
NODE_PATH=./motion/node_modules node $SKILL/engine/beats.js motion/dist/NN-name.html motion/work/NN.png 0.4 1.2 2.1 …
```

Before a full render, sample one still per music beat on music-led reels, or per spoken beat
on speech-led reels. Derive music samples from the track tempo; preserve reading holds.
Pick the times where each state has settled and a couple of mid-morph moments. Look at every sheet yourself. Fix anything cramped, clipped, unreadable or off-word, or where the cursor leaves the frame. Then check once more. Panel clips render on black in the sheet so you can judge them.

Before a full render, inspect one still per beat
(music beats for music-led reels, spoken beats for speech-led reels), plus mid-move frames.
Before hand-over, verify tags remain readable on screen at least 0.8 s and titles at least
1.5 s; nothing covers the speaker or key words. Check a short sample on light and dark grounds.
Record the measured intervals and any intentional full-frame cutaways in the reel's notes.

