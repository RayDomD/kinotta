# B-roll / motion-graphic treatment by video type

Date: 2026-10-20. Purpose: give Kinotta defensible defaults per creator video type.

## Summary

High-trust sources are thin for the exact questions asked. No platform (YouTube, TikTok, Instagram) publishes b-roll density, full-frame vs panel balance, or cut-rate targets. What the primary sources do give:

- **Safe zones and text rules for vertical** (Meta, TikTok, YouTube): hard numbers.
- **Caption readability** (Netflix timed-text guide, W3C): hard numbers for phrase captions; nothing authoritative for word-by-word.
- **Learning video** (Guo, Kim, Rubin 2014, 6.9M sessions): the only large quantitative study. Short chunks, talking head alternating with slides, fast enthusiastic delivery.
- **Tutorial annotation** (TechSmith): callouts of 5-8 words, consistent style, annotate only what helps.
- **Talking head / podcast** (Descript, Adobe): qualitative. B-roll covers jump cuts and adds context; do not overdo it.

Everything numeric about "per minute" density and full-frame vs panel split below is either absent or marked as opinion. Treat the table's "Suggested default" entries as starting points to test, not findings.

## Table

Legend: [S] = sourced claim, [O] = opinion / my inference, not evidenced. "none" = no good source found.

| Type | Full-frame vs panel | Density | Captions | Pacing / cuts | Motion style | Avoid |
|---|---|---|---|---|---|---|
| Explainer / talk to camera | Default: mostly full-frame cutaways to cover jump cuts and illustrate; punch-ins and a second angle for variety [S Descript, Adobe]. Panels: none sourced [O: lower-third or corner panel for named terms] | "Lots of B-roll and graphic elements" [S Descript]; no number. Cut or change visual often (retention advice 3-5 s is practitioner opinion) [O] | Phrase/two-line, 42 chars/line, up to ~20 cps [S Netflix] | Cut pauses and filler [S Descript]; move best material early, rework first 30 s [S YouTube Help] | None sourced for video. Fast-in, gentle settle is the UI-motion norm (see disagreement) [O] | 30-minute unbroken talking head [S Descript]; text that merely repeats narration [S Mayer, secondary] |
| Vlog | None sourced. [O: cutaways full-frame, graphics sparse] | none | none specific | Jump cuts hidden with B-roll; cut to music rhythm [opinion, vendor blogs] | none | Over-polished graphics that break authenticity [S Descript short-form, for short-form] |
| Tutorial / screen walkthrough | Screen is the main frame; emphasis happens inside it (zoom, cursor highlight, callout) rather than cutting away [S TechSmith]. Talking head inserted between screens beats screen alone [S Guo] | Annotate only moments that aid learning, "not every minute" [S TechSmith] | Callout text 5-8 words [S TechSmith]; captions as for explainer | Segment into chunks under 6 min [S Guo]; tutorial viewers re-watch and skim, so support that [S Guo]; median tutorial watch is 2-3 min regardless of length [S Guo] | Slow, deliberate zoom; keep cursor still on the topic [S TechSmith]; consistent arrow/shape style [S TechSmith] | Crowded annotations [S TechSmith]; mouse wandering while talking [S TechSmith] |
| Vertical short (Reels / TikTok / Shorts) | Full-frame dominates the 9:16 canvas; panels compete with platform UI. Keep text out of UI zones (below) [S] | Hook inside first 3 s; "utilize transitions, stickers, and graphics" [S TikTok Ads]; no per-minute number | Burned-in encouraged [S Descript, Spotify]. Text: 5-10 words per second [S TikTok Ads]. Keep clear of top 14%, bottom 35%, sides 6% [S Meta, recommendation]. Word-by-word is popular but unevidenced (see gaps) | "Cut quicker and more visually engaging" than long-form [S Descript quoting a creator]; pace "faster than feels comfortable" [opinion/vendor]; cut tangents [S Descript] | Native, DIY, not overly polished [S TikTok Ads]; eye-catching transitions can look out of place [S Descript] | Text in UI zones; cropping speaker out when reframing [S Descript]; repurposing long-form unchanged [S Descript] |
| Product demo | Screen/product is primary; cutaways to features and UI close-ups [O]. No platform guidance on split | none specific | As tutorial; TikTok ad guidance: show people, keep product proposition in first 3 s [S TikTok Ads] | Wistia: explainers/overviews 1-5 min; landing-page explainer ~60 s [S Wistia, vendor data] | none | Over-produced ad look on TikTok [S TikTok Ads] |
| Interview / podcast clip | Cut between speakers; vary frame; visuals (photo, clip, post) when a visual topic comes up, also to cover awkward edits [S Descript]. Panels: speaker-split layouts are standard [S Descript/Riverside] | Visuals when topic is visual; more in the intro [S Descript]; "still a podcast at heart" | Burned-in, especially for clips; customise size/colour [S Descript]. Spotify clips: 15-90 s, captions recommended [S Spotify] | Don't sit on one shot all episode [S Descript]; no long intros [S Descript] | none | Same grid all episode; glitzy visuals over conversation; long intros [S Descript] |
| Educational lecture | Talking head alternating with slides/code beats slides alone; Guo suggests picture-in-picture as an untested option for jarring switches [S Guo] | Alternating head/slide (60% of videos in one course used it) [S Guo]; no per-minute rate | As explainer; reduce redundant on-screen text [S Mayer, secondary] | Chunks under 6 min; faster, enthusiastic delivery engages more (up to 2x); edit out pauses and filler [S Guo] | Calm, informative; Khan-style drawing/emphasis beat static slides (1.5x-2x watch time) [S Guo] | Studio formality; slow flat delivery; clutter [S Guo, Mayer] |

## By type

### Cross-cutting evidence

- **Opening and retention.** YouTube Help: the "Intro" metric is share still watching after 30 s; remedies are matching thumbnail/title to content, reworking the first 30 s, and moving strong material earlier. https://support.google.com/youtube/answer/9314415?hl=en
- **Hook timing.** TikTok Ads: introduce the proposition in the first 3 s; prioritise the hook in the first 6 s. https://ads.tiktok.com/resources/help/article/creative-best-practices
- **Text rate.** Same page: "5-10 words per second when using text". No size or position given.
- **Caption specs for phrase captions.** Netflix English timed-text guide: 42 characters per line, max two lines, up to 20 cps adults / 17 cps children. https://partnerhelp.netflixstudios.com/hc/en-us/articles/217350977-English-Timed-Text-Style-Guide (This is for subtitles, not social captions; it is the best primary readability spec I could open.)
- **Caption delivery.** W3C: open captions are always displayed and cannot be turned off; players usually default to white text in a black box. https://www.w3.org/WAI/media/av/captions/
- **Cut rate in film (context only).** Cutting et al. report average shot length falling from over 12 s to under 4 s in popular film, and critics note dialogue length constrains shot length. This does not transfer to creator video. https://pmc.ncbi.nlm.nih.gov/articles/PMC3485803/ (via search summary; paper not opened)

### Explainer / talk to camera

- Descript: talking heads need "lots of B-roll and graphic elements", titles/captions/annotations to highlight points, tight editing that cuts pauses and filler, and variety from a second angle and punch-ins. No ratios or timings given. https://www.descript.com/blog/article/tips-for-making-a-talking-head-video-that-people-want-to-watch
- Adobe: B-roll originated to hide cuts; use it over jump cuts and over dull footage; layer it on the track above the A-roll. https://www.adobe.com/creativecloud/video/discover/b-roll.html and https://www.adobe.com/creativecloud/video/discover/jump-cut.html
- Descript layouts classify media into roles (Talking Head, Screen Recording, Graphics, B-Roll/Other) and offer split-screen and picture-in-picture explainer layouts, so panel layouts are a standard tool, but no source says when to prefer them. https://help.descript.com/visuals/visual-roles
- Opinion (not sourced): changing the visual every 3-5 s for educational talking-head content; this appears only in creator blogs.

### Vlog

- No primary or high-trust source gave vlog-specific b-roll density or caption conventions. Search returned vendor blogs advising jump cuts covered by B-roll and cuts timed to music. Treat as opinion.
- Related first-party claim for short-form authentic content: polished graphics and eye-catching transitions "can seem out of place" where authenticity is valued. https://www.descript.com/blog/article/edit-short-form-video
- Suggested default [O]: mostly full-frame cutaways, minimal graphics, lower-thirds only for places or names.

### Tutorial / screen walkthrough

- TechSmith: callouts "five to eight words whenever possible", one consistent style for arrows/shapes/colours, annotate only what improves comprehension, "not every minute". https://www.techsmith.com/blog/annotate-recorded-calls/ (written about recorded calls, same tool and principle.)
- TechSmith Camtasia tutorial: slow deliberate mouse movement, keep the cursor still on the area under discussion, zoom to focus attention. https://www.techsmith.com/learn/tutorials/camtasia/animations/ (via search summary)
- Guo et al.: tutorials are watched 2-3 min median regardless of length; viewers re-watch and skim; Khan-style drawing over slides/code beats static slides/code at 1.5x-2x watch time; interspersing the instructor's face beats slides alone. https://www.cs.rochester.edu/hci/pubs/pdfs/edX-MOOC-video-production-and-engagement_LAS-2014.pdf
- Wistia vendor data: 3-5 min instructional videos average 74% engagement vs 43% for all 3-5 min videos (2024 report, via search summary). https://wistia.com/learn/marketing/insights-state-of-video-report

### Vertical short

- Meta Ads guide: consider leaving roughly 14% of the top, 35% of the bottom, and 6% on each side free of text. These are advertising recommendations for Reels. https://www.facebook.com/business/ads-guide/update/image/instagram-reels
- Meta Reels ads page: vertical, quality audio and key messages in the safe zone perform better. https://www.facebook.com/business/ads/facebook-instagram-reels-ads
- TikTok Ads: in-feed safe zone is stricter than open-screen and shrinks with longer ad captions; no pixel values on the page I could open. https://ads.tiktok.com/resources/help/article/tiktok-reservation-topview (search summary only) and creative best practices above.
- YouTube Shorts help: editor shows guides for where like/comment/description UI covers the frame; text timeline lets you time each text clip. No length, pace or position numbers. https://support.google.com/youtube/answer/13380879?hl=en
- Descript: first 3 s hook, 9:16, burned-in captions, cut tangents, avoid flashy transitions that clash with authenticity, avoid cropping out the speaker. Contains no cut rate or caption size. https://www.descript.com/blog/article/edit-short-form-video

### Product demo

- Little first-party editing guidance. TikTok Ads favours DIY/UGC-feeling creative with people on screen. https://ads.tiktok.com/resources/help/article/creative-best-practices
- Wistia (vendor, own-platform data): explainers/product overviews 1-5 min; landing-page explainer ~60 s. https://wistia.com/blog/optimal-video-length
- Reasonable default [O]: reuse the tutorial treatment (screen-primary, emphasis inside the frame, short callouts) with shorter runtime.

### Interview / podcast clip

- Descript: do not sit on one shot; cut between speakers or vary layout; put visuals on screen when something visual is discussed (also covers awkward edits); heavier visuals in intro; burned-in subtitles for clips; no long intros; remote interviews especially benefit from cutaways. https://www.descript.com/blog/article/adding-video-to-your-podcast-avoid-these-common-mistakes
- Spotify clips: 15-90 s, captions recommended, vertical preferred. https://support.spotify.com/us/creators/article/clips/
- No source on how much of runtime should be graphics.

### Educational lecture

- Guo et al. is the strongest evidence in this document. Key numbers: median engagement at most 6 min regardless of length; students often get less than halfway through videos over 9 min; talking head alternating with slides raised engagement and problem attempts (46% vs 33% in one course); informal setting with eye contact beat a studio; faster-speaking enthusiastic instructors engaged up to 2x more (mean 156 wpm; sd 31). Caveats: MOOC viewers, watch-time proxy for attention, edX 2013 data. Same URL as above.
- Mayer's multimedia principles (coherence, signaling, redundancy, segmenting) back restraint with on-screen text that duplicates narration. I only reached secondary summaries, not Mayer's text. https://u.osu.edu/multimedialearning/?p=11

## Where sources disagree

- **Visual change interval.** Creator blogs give 3-5 s for educational content and 15-30 s attention resets; TikTok ad guidance in a third-party guide says every 1-2 s; none is a platform or research source. TikTok Ads' own page gives no cut rate.
- **Over-editing.** Some practitioners say endless zooms and whooshes feel chaotic; others recommend punch-ins and fast cuts. Descript says both: add punch-ins for variety, and avoid polished transitions in authentic short-form.
- **Speaking rate / pace.** The widely quoted 160 wpm optimum is for live lectures; Guo et al. found faster speakers engaged more online, with a dip at 145-165 wpm for 6-12 min videos.
- **Tutorial length.** TechSmith's 2019 survey (via a German summary) said 52% prefer 3-6 min; its 2024 report page says 10-19 min is fine if content is dense (I could not verify the 10-19 min figure at its source). Guo found tutorial watch time is 2-3 min regardless. https://www.techsmith.com/ (search summary only)
- **Caption position.** Meta says keep text out of the bottom 35% for Reels ads, others quote "bottom 20%" for TikTok. TikTok's published value was not found. Sources conflict on BBC online guideline positions (only blogs reached).
- **UI motion durations.** Material's legacy tokens give ~250 ms standard decelerate and 400 ms emphasized decelerate for entering elements, now superseded by spring-based motion. Another UI source suggests 500-800 ms for hero reveals. These are app-UI conventions, not video. https://m3.material.io/styles/motion/easing-and-duration

## Gaps / weak evidence

- **No platform source for b-roll density.** YouTube, TikTok, Instagram do not publish graphics-per-minute or cutaway share. Any "x% of runtime" would be invented, so none is given.
- **No source for full-frame vs panel balance.** Descript documents layout types but not when to use which. Treat all balance defaults as opinion.
- **No evidence for word-by-word captions.** I found one thesis-level 2023 comparison favouring two-line captions over word-by-word for lecture comprehension (not read in full), and vendor claims about engagement. Treat word-by-word as a style choice for short-form, not an evidenced default. Searched but unconfirmed source: https://researchportal.be/nl/node/4714358
- **BBC Subtitle Guidelines not reachable.** bbc.github.io returned 404 and bbc.co.uk is blocked for my fetcher. Secondary summaries give 160-180 wpm and two lines, unverified. Netflix guide used instead.
- **DCMP Captioning Key** top page had no numbers; sub-pages not opened.
- **TikTok and Instagram creator portals** returned redirects or marketing text; no creator-side caption or safe-zone numbers found. Ads docs (Meta numbers verified on the page; TikTok no numbers) used as a proxy; ad guidance may be stricter than organic.
- **Motion style for video overlays.** No School of Motion or Apple/Adobe motion-graphics source was reached. "Snappy vs calm vs keynote-like" per type has no evidence; the only available guidance is UI motion systems (Material/Carbon), which are an analogy.
- **Vlog and product demo** have the weakest coverage (vendor blogs only).
- **Practitioner-opinion items** are marked [O] or "opinion" above; vendor blogs (Descript, Wistia, TechSmith, Riverside) are first-party about their own tools but have commercial interests.
