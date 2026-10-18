# Assessment B: font-size adjudication

Current scan: **55 `design-system-font-size` advisories**, comprising **39 in `web/src/styles.css`** and **16 in `web/src/review/review.css`**. The inherited count of 39 is the current count for the shared stylesheet, not the complete `web/src` total. These are literal-property advisories, not 55 accessibility failures. The detector reads the YAML ramp's 22/15/13/12px steps and does not fully understand the role ranges in the prose or CSS font shorthand.

Authority: `DESIGN.md` Typography permits Body 15px; Title 15px; Headline 22px; Meta 12–13px; Review meta 11–14px (lane text 11–12.5px, tools/tabs 13–14px, hints/Working note 12–13px); Numeral Doto 10–14px. Explicit component/mockup choices are also evidence of intent, so a larger word-pinning row or a plus glyph is not an undersized body text failure. Generic 16px defaults do not override Kinotta's 15px body.

`Retain` means the occurrence is justified by role or concrete component evidence; `Drift` means it does not match the documented role; `Inactive` means no current JSX use was found; `Outside` means the occurrence belongs to an adjacent, unreviewed flow. None is authorization to change code.

| File:line | Selector / size | Disposition and role reasoning |
|---|---|---|
| review/review.css:99 | `.rv-frame .rv-problem, .rv-frame .mv-audio-only` 14 | Retain: Review status/meta, within 11–14. |
| review/review.css:109 | `.rv-tool` 14 | Retain: Review tool label, explicit 13–14. |
| review/review.css:162 | `.rv-off` 11 | Retain: lane status label, explicit lane floor 11. |
| review/review.css:193 | `.rv-tabs button` 14 | Retain: Review tab labels, explicit 13–14. |
| review/review.css:201 | `.rv-save .quiet-link` 14 | Inactive: Save container no longer appears in JSX; not a current control defect. |
| review/review.css:206 | `.rv-who` 11 | Retain: general Review author metadata 11–14. The specific Working/freeze rail note is overridden to 12px by the more specific `.versions .rv-who` in `styles.css:597`, matching the 12–13 role; do not raise it to 16. |
| review/review.css:214 | `.rv-undo kbd` 11 | Retain: shortcut metadata in Review 11–14; not body. |
| review/review.css:247 | `.editorial-text-bar > button` 11 | Retain: explicit lane text 11–12.5. |
| review/review.css:256 | `.editorial-pin` 11 | Retain size: numeral 10–14. Separate implementation drift: this selector inherits Outfit and rounds the pin, rather than using Doto and the hex silhouette. |
| review/review.css:271 | `.editor-library-types button` 11 | Drift: these are media filter tabs; the specific tools/tabs role is 13–14. Outside the populated Parts fixture's default state, so source evidence only. |
| review/review.css:278 | `.editor-media-preview span` 10 | Drift: paths/effect descriptions are prose metadata, below Review's explicit 11px floor; the 10px numeral exemption does not apply. Source evidence only. |
| review/review.css:281 | `.editor-media-add` 18 | Retain: standalone plus glyph, not a text size-ramp role. Its 24×24 target is a separate touch consideration. |
| review/review.css:282 | `.editor-media-problem` 11 | Retain: Review status/meta within 11–14. |
| review/review.css:302 | `.native-clip` 11 | Retain: lane labels, explicit 11–12.5. |
| review/review.css:330 | `.native-retry` 11 | Retain: status/retry within a dense lane, Review meta floor 11. |
| review/review.css:336 | `.native-track-header > input` 11 | Retain: lane name, explicit lane text 11–12.5. |
| styles.css:70 | `.editor-settings h2` 18 | Outside: Settings heading, no 18px hierarchy step recorded. Documentation/type-role drift, not evidence of too-small body text. |
| styles.css:132 | `.brand` 14 | Retain: brand wordmark, separately sized in incumbent mockups; not body. |
| styles.css:136 | `.modes :is(span, button)` 14 | Retain in Review: phase tab label, explicit 13–14. Shared Storyboard navigation has the same incumbent component. |
| styles.css:142 | `.btn` 14 | Retain in Review: tool/action label 13–14. Shared primary action is similarly 14px in the accepted Working mockup. |
| styles.css:166 | `.reels button` 14 | Retain: navigation control, incumbent 14px Working mockup text. Do not classify as body solely because it is a button. |
| styles.css:171 | `.versions button` 14 | Retain: 14px version navigation in accepted Working mockup. |
| styles.css:187 | `.secs .nm` 14 | Retain: dense navigation label consistent with shared 14px rail; no evidence that this should be 16. Small documentation gap in the general Storyboard rail role. |
| styles.css:202 | `.head h1 .dot` 17 | Drift: section identifier is a numeral, above the explicit 10–14 range. Not a legibility defect. |
| styles.css:207 | `.readonly-note` 14 | Drift on Storyboard: instructional prose has Body 15px; `.comments .readonly-note` later overrides to 13px meta. Review-specific 11–14 does not globally exempt Storyboard prose. |
| styles.css:214 | `.issues li` 14 | Drift: explanatory issue copy, Body 15px; size alone does not establish WCAG failure. |
| styles.css:217 | `.issues-line` 14 | Drift: collapsed issue explanatory copy, Body 15px. |
| styles.css:236 | `.shot-alternates` 14 | Drift: Storyboard status label should use 12–13px Meta; count text is not all Doto (separate numeral-role issue). Existing 14px status does not need raising to 16. |
| styles.css:240 | `.alternate-choice-count` 14 | Drift: Storyboard status label above general 12–13px Meta; nested `.num` explicitly uses Doto and is within numeral range. |
| styles.css:266 | `.alternate-view` 16 | Drift: alternate card title is Title 15px. No automatic move to a generic 16px floor. |
| styles.css:268 | `.alternate-preview p` 14 | Drift: alternate note is descriptive Body 15px. |
| styles.css:271 | `.alternate-actions label` 14 | Drift: Storyboard/ShotSheet field label outside Meta 12–13px; not body reading copy. |
| styles.css:272 | `.alternate-actions input` 16 | Drift: body/input role is 15px in Kinotta. This is larger than required, not undersized. Retaining 16px can be justified for mobile field zoom if explicitly documented. |
| styles.css:275 | `.draft-options` 14 | Drift: Storyboard/ShotSheet field labels outside Meta 12–13px. |
| styles.css:278 | `.draft-options select` 16 | Drift: input role is Body 15px; larger than required, not an accessibility failure. |
| styles.css:291 | `.lbl .dot` 14 | Retain: Doto shot numeral 10–14, explicit allowed size. |
| styles.css:302 | `.kind` 11 | Retain: compact badge, global micro-label role; do not treat as body. DESIGN does not separately specify a badge floor, so document the role if normalizing the system. |
| styles.css:303 | `.line` 14 | Drift: spoken-line reading copy has Body 15px. |
| styles.css:377 | `.comments h2` 16 | Retain concrete component: Comments heading is 16px in the accepted 2026-10-13 alternates mockup; generic hierarchy omits this component step. Documentation reconciliation, not automatic UI enlargement. |
| styles.css:384 | `.c p` 14 | Drift against DESIGN Body 15px for comment text. The 2026-10-13 mockup also uses 14px, so this is an authority mismatch to settle deliberately, not 39 items to raise to 16. |
| styles.css:410 | `.note-read` 14 | Drift: note reading copy is explicitly Body 15px. |
| styles.css:419 | `.sheet .close` 14 | Retain: quiet action/control label consistent with incumbent 14px controls; no reading-body failure. |
| styles.css:456 | `.tr-a` 19 | Retain concrete component: interactive word-pinning row is 19px in accepted `2026-09-30-sections-transcript.html:178`; larger targeting/reading role, not body failure. |
| styles.css:472 | `.empty` 14 | Drift: explanatory empty-state prose versus Body 15px, but empty states are not populated fixture evidence. |
| styles.css:486 | `.rv-lede` 14 | Outside: New reel description, versus Body 15px. |
| styles.css:490 | `.rv-pick .p` 14 | Outside: New reel path label, 14px without explicit role. |
| styles.css:495 | `.rv-name input` 16 | Outside: New reel input, larger than documented 15px body. |
| styles.css:508 | `.rv-dropzone .rv-drop-note` 14 | Outside: new reel/drop instruction, versus Body 15px. |
| styles.css:513 | `.rv-dropzone .rv-drop-status` 14 | Outside: drop status, 14px without explicit general Meta role. |
| styles.css:538 | `.rv-brief h2` 16 | Outside: Brief heading, not a target-surface body defect. |
| styles.css:554 | `.pk-render h2, .pk-past h2` 16 | Outside: Render/past files heading, same concrete heading pattern as Comments; hierarchy documentation gap. |
| styles.css:557 | `.pk-preset` 14 | Retain in Review: Render choice/tool label, explicit Review 13–14. Render submission was not exercised. |
| styles.css:574 | `.pk-queue h2` 16 | Outside: Renders queue heading, concrete heading pattern; not body. |
| styles.css:586 | `.rv-approved` 14 | Retain: Review status, within 11–14. Approval mutation was not exercised. |
| styles.css:591 | `.popover h2` 16 | Outside: popover heading pattern; generic hierarchy documentation gap. |

Recommended decision: preserve documented dense roles and the 15px Body default. Reconcile the few actual body/role mismatches as a focused future typography task. Do not add detector ignores or mechanically raise all occurrences to 16px. `context.mjs` also reports the generated `.impeccable/design.json` sidecar stale; no metadata repair was performed.
