Reads: `../SKILL.md` and the reel.
Does: Inspect stills and readability, then run `kinotta check <slug>`.
Writes: Check findings and reel notes.
Owner's check: Review the checked reel.

Paths such as `reference/`, `assets/`, `templates/`, `engine/` and `scripts/` are relative to the skill root, not this stage folder.

## Check stills on the key words and every beat

```bash
NODE_PATH=./motion/node_modules node $SKILL/engine/beats.js motion/dist/NN-name.html motion/work/NN.png 0.4 1.2 2.1 …
```

Before a full render, sample one still per music beat on music-led reels, or per spoken beat
on speech-led reels. Derive music samples from the track tempo; preserve reading holds.
Pick the times where each state has settled and a couple of mid-morph moments. Look at every sheet yourself. Fix anything cramped, clipped, unreadable or off-word, or where the cursor leaves the frame. Then check once more. Panel clips render on black in the sheet so you can judge them.

Before hand-over, verify tags remain readable on screen at least 0.8 s and titles at least
1.5 s; nothing covers the speaker or key words. Check a short sample on light and dark grounds.
Record the measured intervals and any intentional full-frame cutaways in the reel's notes.

Run `kinotta check <slug>` from the project folder. Resolve reported contract issues and repeat the check until it reports `no contract issues`.

