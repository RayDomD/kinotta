---
title: Resolve reported pin lock after Copy (X16)
date: 2026-10-30
status: Blocked
summary: Await the observed pin-lock symptom before choosing a behavior change.
spec: https://github.com/RayDomD/kinotta/issues/125
---

## Intent

- Problem: The brief reports that the pin lock stays on after Copy, without identifying the control or disabled interaction.
- Why: Active pin placement and read-only pin editing need different fixes.
- Proposed outcome: Reproduce the reported symptom and release the relevant lock after Copy.
- Affected: A deferred browser regression; implementation surface pending clarification.
- Constraints: Do not guess product behavior. Preserve Working and saved-version boundaries.
- Out of scope: Other fixes, inline alternatives, published assets.
- Open questions: Does X16 mean Pin mode remains active, or adding/editing pins stays disabled? Which surface?

## Goal

Once the symptom is clarified, reproduce it through the UI, implement the smallest fix and verify the same interaction after Copy.

## Approach

Blocked by issue #125 and the focused owner question. SimpleMode.tsx:203 keeps pinMode state; MediaEditor.tsx:112 keeps pinning state. The existing Simple pin-mode plan says that mode stays active until toggled. Separately, Storyboard.tsx:338 and ShotSheet.tsx:70 enforce saved-version read-only state. readWorkingVersion at server/core/index.ts:217 explicitly returns isNewest true.

A public API diagnostic copied edited Working into v3, read Working and saved another pin successfully: workingVersion=3, editable=true, afterCopyPinSaved=true. This rules out a general server comment lock but does not establish the reported UI behavior.

## Steps

1. Record ambiguity and a test.fixme with issue #125, per brief rule 2.
2. Await the observed control/surface and expected action.
3. Add a failing browser regression, implement the scoped fix, run it under the browser lock and request review.

## Risks

Turning pin mode off could contradict the documented persistent mode if the report actually concerns disabled editing. Removing a read-only guard could make saved versions editable.

## Checks to run

Pending actual interaction. Existing API diagnostic passed; no behavioral fix or regression pass claimed.

## Changelog

### 2026-10-30
- Traced both candidate code paths; asked owner for the symptom; opened #125. Deferred the regression instead of guessing, as required by the brief.
