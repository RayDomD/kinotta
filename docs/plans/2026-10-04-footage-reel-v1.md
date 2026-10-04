---
title: Footage reel v1 from a video (T23)
date: 2026-10-04
status: Done
summary: T23 (#26). The Kinotta skill builds a footage reel's v1 from a video, with transcript and shot-list scripts and no plan approval in chat.
spec: docs/tickets.md T23 (#26); K13, K14 in docs/2026-09-30-grilling-decisions.md
---

## Intent

- Problem: The skill has the engine but no rules for turning a video into a Kinotta footage version.
- Why: T24 (next version from a section batch) and the real run (T25) start from a v1.
- Proposed outcome: Asked for b-roll on a project video, Claude saves the transcript, references the
  footage, splits sections, plans and builds clips, composes v1, writes the shot list and runs the check.
- Affected: `skill/kinotta/SKILL.md`, new `scripts/transcript.py` and `scripts/shots.py`, the grilling
  log, the footage sample's plan and shot list.
- Constraints: No plan approval in chat (K14). Footage versions are animated (K13). The footage stays put.
- Out of scope: batches on footage reels (T24), rendering.
- Open questions: none.

## Goal

T23's acceptance criteria met.

## Approach

Two small scripts take the mechanical, error-prone steps: `transcript.py` (captions or faster-whisper to
`transcript.json`) and `shots.py` (plan to `shots.json`, shots placed where each clip has settled). The
plan gains `sections` and per-clip `section`, `description` and optional `still`. SKILL.md section 5
becomes the workflow. The footage sample's shot list is now `shots.py` output.

## Steps

1. Scripts and their tests; the sample's plan and shot list.
2. SKILL.md section 5, hard rule and preflight; K13 and K14.
3. Dry run of section 5 in a scratch project; full checks.

## Risks

- The faster-whisper path can't run here (not installed).

## Checks to run

`npm run typecheck`, `npm test`, `npm run test:e2e`, the dry run.

## Changelog

### 2026-10-04
- Plan created and done in one run, under the owner's go-ahead.
