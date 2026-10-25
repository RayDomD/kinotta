# Built-in brand

Kinotta's default colour and type, used when a project has no `DESIGN.md` (or an empty one). It
lets a beginner with only a video build a reel. It matches the defaults the effect templates already
use in `templates/effects/shared.css` and the engine's bundled fonts, so a reel built on it looks the
same whether a shot comes from a template or is written fresh.

Replace it by adding a `DESIGN.md` at the project root and deleting `reels/brand.md`; the skill
then writes a brand file from the project's own sources.

## Type

- Words: **Geist**, variable weight 100 to 900 (`fonts/Geist-Variable.woff2`). Headlines 700 to
  800 with tight tracking; body 500.
- Numbers and code: **Geist Mono** Medium (`fonts/GeistMono-Medium.woff2`), tabular figures.
- Fallbacks: `"Segoe UI", system-ui, sans-serif` for words, `ui-monospace, monospace` for mono.
- Licenses: both SIL Open Font License 1.1; see `LICENSES.md`.

## Colour

Dark ground, near-white ink, one cool accent. Values are the effect tokens, so a plan's
`brand.tokens` can pass them through unchanged.

| Role | Token | Value |
|---|---|---|
| Ground | `--fx-ground` | `#181b1d` |
| Ink | `--fx-ink` | `oklch(.97 .005 90)` |
| Soft ink | `--fx-ink-soft` | `oklch(.80 .01 90)` |
| Panel | `--fx-panel` | `oklch(.20 .006 90 / .92)` |
| Panel edge | `--fx-panel-edge` | `oklch(1 0 0 / .10)` |
| Accent | `--fx-accent` | `oklch(.86 .12 225)` |

Use the accent sparingly: one highlighted word, a key number or a progress mark per shot.

## Logo

None. Use the reel title in Geist where a logo would go.

## Motion

The engine's default curves (`reference/engine-api.md`, "Without a brand"). The built-in brand
adds none of its own.
