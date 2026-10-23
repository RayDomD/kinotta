# Prompt Motion: direction and motion taste

Read on 2026-10-23 for steps 1–2 of the motion-taste plan. All eight requested pages loaded. This note paraphrases the site's analysis; it reproduces no prompts, sentences, code, video or assets. Counts below are the site's reports, not an independent recount or an experiment run in Kinotta.

## Gallery: `/`

[Source: gallery](https://prompt-motion.com/). The site presents creator-submitted Claude Opus 5.5 motion videos alongside their prompts or skills. Filters include interface demonstrations, phones, charts, diagrams, typography and shapes. These are browsing categories, not evidence that any particular effect improves a reel. The current gallery should not be assumed to have the same counts as the articles' historical snapshot.

The footer attributes ownership to the individual creators. Viewing an entry does not grant permission to reuse its prompt, footage or implementation. This work uses descriptions of techniques only.

## Template index: `/templates`

[Source: template index](https://prompt-motion.com/templates). The curator describes editable prompt templates accompanied by an unedited result from a run. The index currently links a 3D template and a showreel template; explainer, product-film and short-film templates are described as future work. An example run demonstrates an output, not repeatable quality or a controlled comparison. The same creator-ownership notice appears here.

## Showreel: `/templates/showreel`

[Source: showreel](https://prompt-motion.com/templates/showreel). The curator's revision supplies an overarching visual idea, continuity between scenes, musical structure, constrained styling and a storyboard. It asks for sampled frames before encoding the complete video. Its loop closes by returning to the opening composition. Deterministic time-based animation and motion-blurred frame capture are build instructions, rather than measured aesthetic findings.

The page groups 49 examples using the original instruction or a close variation. This differs from the older article's 33 exact matches; the definitions and snapshot differ, so those counts should not be combined. The page shows one unedited run of the revision, without a controlled before/after test. Its rapid pacing suits its showreel example, not every speech-led reel.

## Gallery analysis: `/blog/ai-motion-graphics-prompts`

[Source: gallery analysis](https://prompt-motion.com/blog/ai-motion-graphics-prompts). Published October 10, 2026; collection ran September 23–October 8. The October 10 snapshot contains 233 entries by 216 creators, including 230 shared prompts. Thus the plan's September 23–October 10 shorthand spans collection and publication, not collection alone.

Reported observations: median prompt length was 26 words. Across 33 matching instructions, likes ranged from 0 to 17,023, with a median of 5. Nineteen prompts exceeding 100 words had a median of 56 likes, versus 5 for those at most 26 words.

The author interprets explicit direction, restrictions, musical timing, rendering instructions and visual review as useful decisions. This is observational evidence, not proof of causation. Audience, posting time, creator experience and small groups confound comparisons. Likes were fetched October 4–8; word counts omit 18 Chinese-, Japanese- or Korean-language prompts. Matching ignores case and punctuation; tool and effort settings are self-reported and often absent.

## Visual defaults: `/blog/make-ai-motion-graphics-look-less-ai`

[Source: visual-default analysis](https://prompt-motion.com/blog/make-ai-motion-graphics-look-less-ai). Published October 10, 2026. Explicit restriction lists occur in 16 of 230 prompts, from 12 creators; four are among the 20 most-liked entries. The reported median is 56 likes, compared with 7 across the gallery. Repeated submissions from a creator make the creator counts more informative than prompt counts.

The author's design argument is that unmotivated effects, dissolves and peripheral readouts can substitute for an idea. Suggested remedies include preserving an element through scene changes, making labels informative, limiting overshoot and retaining pauses when reading requires them. Each restriction should give the builder a usable replacement. These are judgments drawn from selected examples; the like comparison does not establish their effect on quality.

The article also distinguishes reproducible animation from visual taste: random frame construction can invalidate an earlier correction. Kinotta already requires repeatable seeking, so that is not a new taste rule.

## Explainers: `/blog/ai-explainer-video-prompts`

[Source: explainer analysis](https://prompt-motion.com/blog/ai-explainer-video-prompts). Published October 10, 2026; the sample is 27 explainer entries in that day's snapshot. Median prompt length is 15 words. Eight specify duration, eight specify visual style, six mention sound, two identify an audience, and none request fact verification or references. Word counts exclude four prompts in Chinese, Japanese or Korean; engagement was fetched October 4–8.

The author recommends an ordered transformation or an explicit scene sequence instead of an unconstrained topic. Audience, duration, visual treatment, accuracy and audio choices belong in the brief. Roughly five seconds per idea is offered as a starting estimate, not a measured optimum. A process can be physical, conceptual or chronological; forcing every subject into a physical demonstration is unnecessary.

For Kinotta, a process rule would add structure across shots. Accuracy and audience questions belong in the later authoring-guidance step; they are not implemented by this note.

## Launch films: `/blog/ai-launch-video-prompts`

[Source: launch analysis](https://prompt-motion.com/blog/ai-launch-video-prompts). Published October 10, 2026. Of 94 launch/promo entries, 92 include prompts. Twenty-six reuse the showreel instruction as a starting point. Seven explicitly request inputs; 14 mention branding, 11 mention musical timing, and 12 specify format or dimensions. Thirteen prompts longer than 100 words have a reported median of 56 likes. These are associations, not evidence that length itself helps.

The author recommends collecting the product's benefit, an ordered selection of actual screens/actions, visual identity, timing, ending and target format. Landscape dominates the sample (76 entries, versus 12 portrait and six square), which is not a reason to default a phone-feed film to landscape.

The article's methodology uses the October 10 category snapshot and October 4–8 engagement captures; non-space-delimited languages are excluded from word counts. Audience affects likes, and textual mention counts cannot establish what was supplied in earlier conversation or project context.

## Rendering approaches: `/blog/remotion-vs-hyperframes`

[Source: renderer comparison](https://prompt-motion.com/blog/remotion-vs-hyperframes). Published October 10, 2026. Only 56 of 233 entries identify rendering tools: 23 plain browser-based implementations, 13 Remotion, ten HyperFrames, five Three.js and five other approaches. The remaining 177 do not disclose a tool. Attribution is self-reported, and some entries use several tools; these are not clean experimental groups.

The article describes time-indexed browser capture followed by video encoding as a common approach. It distinguishes direct HTML authoring, React-based composition, packaged HTML rendering and 3D scene construction. It explicitly discourages selecting a renderer from engagement medians because the samples are small and audience and video content dominate.

For this task, the relevant lesson is to specify a repeatable build method. Kinotta already has one. No migration, licence assessment or independent verification of the article's tool descriptions was performed; no engine change is proposed.

## Application to the taste diff

The plan's proposed-additions table separates new obligations from nearby existing rules. The viewer-facing concept test, reading holds, device variety, decorative-motion ban, glow/gradient restrictions and fabricated-statistics ban already exist in `~/.kinotta/taste.md`; restating them would lengthen the list without changing behavior.

Text replacement timing and scaled-text rasterization are already discussed in `skill/kinotta/reference/motion-broll.md`; the proposal makes those checks global taste guidance, not new techniques. Existing key-word still checks also cover speech-led clips. Music-beat still review remains a later skill change. Brief collection and all seven optional templates remain outside this phase.

The plan's draft about extending a covering shape beyond every corner is not established by the eight pages read here. It is omitted from the proposed source-derived additions rather than presented as a measured finding. Loop closure is conditional on an intended loop, and music timing preserves speech-led pacing under O2.
