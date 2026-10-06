# Renders in the background, everywhere: summary

Date: 2026-10-06. Ticket T56 (#52). Plan: `docs/plans/2026-10-05-renders-everywhere.md`.

## Shipped vs planned

Shipped as planned.

- **Jobs in the app.** `App` loads the queue once (`fetchRenderJobs()`, `GET /api/renders`), then keeps it from
  `render-progress` events. A known job is updated in place, a new one joins the end, and a finished, failed or cancelled
  one leaves. The client gains `fetchRenderJobs()` and `cancelRender(id)`.
- **Queue (Picker's right column, between Render and Past renders).** The running job reads `v2 Draft · 42% · about 1
  min left`, with a thin progress bar in the ice light. Waiting jobs read `v1 Draft · waiting`. Each has Cancel. A job of
  another reel is prefixed with that reel's title. The last failed render's reason shows as an alert until another is
  queued.
- **Top bar.** On every tab, while the queue has jobs, the bar shows `Rendering v2 Draft 42%` (the percent in Doto) and
  `1 waiting`, as a polite status named Render.
- **Ready notice.** A finished render raises `<reel> v2 Draft is ready.` with Play (`.mp4` only), Show in folder and
  Dismiss. It is fixed over the bottom of the main column on any tab. Play opens that reel in Picker playing the file.
- `formatRemaining` moved from the review module to `timecode.ts`, so Picker and Review share it.

## Deviations

- **The spec was not run red first.** With nothing built it would fail at its first check, and getting there means
  queueing two renders on a machine that had just run short of memory.
- **The renders spec waits up to 30 s for the first estimate.** In the full suite a render sat at "0% · starting" for
  more than 5 s while its Chromium pages started.
- **`versions.spec.ts` updated for T55.** Its exact match on the version listing missed T55's `comments` and `issues`
  fields. T55 was committed without a full Playwright run, so this showed up here.

## Checks

- typecheck: clean.
- vitest: the unit project, 39 files, 374 passed, 1 skipped (T56 changes no server code).
- Playwright: full suite, 102 passed, 3 failed, 2 did not run. The failures were the renders spec's 5 s estimate wait,
  the T55 listing fields in `versions.spec.ts` (its two later serial tests did not run), and `transcription.spec.ts`, a
  known flake. After the two fixes, those three files passed together: 7 passed.
- A screenshot with two Drafts queued showed the indicator, the queue and the ready notice in place.
