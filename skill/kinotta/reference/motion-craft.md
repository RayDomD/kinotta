# Motion craft for code-built reels

Read this before planning a code-built motion reel (parts shots, contract 2) that should feel filmed rather than laid out: a brand intro, a product film, a showreel. It records the process that took a flat reel (locked camera, one plane per shot, near-monochrome) to one with a moving camera, depth and light, inside Kinotta's shot rules. `contract.md` still governs every rule it touches.

## 1. Treatment first

Agree a written treatment with the owner before building anything. Record it in the reel's notes.

- **Concept line:** what the viewer understands or feels, and how every shot serves it.
- **World:** what the ground is, what objects persist across shots, and which one colour may glow.
- **Beats:** one row per shot with its seconds, what happens, the camera move, and the transition out.
- **Signature move:** one moment the reel is remembered by. Give it the longest shot.
- **Illustrative items:** list invented copy, numbers and names, and say they are illustrative.
- **Sound:** ask. Do not add it unasked.

A treatment table looks like this:

| Shot | Time | Action | Camera | Out |
|---|---|---|---|---|
| noise | 0–4.0 | Vague phrases hang at depth; far ones out of focus | Low crane forward through them, slight roll | Hex cursor streaks in |
| pin | 8.5–14.0 | Signature: the hex rises into a lit pin; a tag stands up | Dive from high to pin level, into the glow | Iris closes on the pin |

## 2. Rules of the frame

1. **Every frame is a pure function of time.** No timers, no `Math.random()`; seed any noise from time or index.
2. **The camera keeps moving.** Vary angle, height and distance between shots. No static hold over about 1.5 s, except a final settle.
3. **Build a world, not a slide.** A floor to the horizon, objects at several depths, and the same world coordinates in every shot, so an object one shot leaves is where the next shot finds it.
4. **One light.** Only the state colour glows (Kinotta's ice). Everything else is ink and muted greys.
5. **Transitions are events.** Flash, iris, whip pan, streak. Split each event across the cut: the outgoing shot builds it, the incoming shot resolves it.
6. **Continuity by matching poses.** Copy shot n's last camera key, exactly, as shot n+1's first key. Shots share no state, so this is the only thing joining them.
7. **Check stills, then fix what they show** (section 5).

## 3. Kinotta's limits and what they mean

- **No imports in shot modules.** Three.js and other libraries are out. Copy the rig in section 4 into each `shot.js`; the duplication is the price of independent, revisable shots.
- **The Storyboard still is local time 0.** Parts shots have no still offset. Frame 0 must show the shot's content: start an iris already partly open (a 560 px circle, not 0), start fly-ins already in view, have phrases visible from the first frame.
- **Inherit visibility; never set `visible`.** The page hides inactive shots with `visibility: hidden` on the section. A descendant set to `visibility: visible` shows through anyway, leaking into every other shot. Hide an element with `'hidden'` and show it with `''`.
- **`seek` clamps to `DURATION`.** When checking a moved scene, move it inside the reel's length.
- **Swapping a shot can break the camera line.** An alternate need not end on the same pose; the transition events are what hide the join.
- **No bloom or motion blur from the render path yet.** Fake glow with CSS `drop-shadow` and canvas gradients; fake a whip with a directional SVG blur (section 4).

## 4. The rig

World units are pixels: x right, y down (the floor is y = 0, up is negative), z toward the viewer. A canvas draws the floor, light and glow. DOM planes carry text and every `data-el`, so pins land on real elements. One camera drives both.

**Layering in `shot.html`:** a `.world` wrapper holding `canvas.floor` (the `field` element) and `.persp > .rig`; above it a `canvas.fx` for glow and trails, a vignette and a grain canvas, all `pointer-events: none`. `.persp` is full frame with `perspective-origin: 960px 540px`. `.rig` sits at `left: 960px; top: 540px`, zero size, `transform-style: preserve-3d; transform-origin: 0 0`. Each plane inside is absolute at 0,0 with `transform-origin: 0 0`.

**Camera keys** are `{ t, p: [x,y,z], l: [x,y,z], r: roll, f: vertical fov }`, interpolated Catmull-Rom (Hermite with tangents from the neighbouring keys). Add a few units of sine drift for handheld life, and a damped kick, `s · e^(−6.5a) · sin(38a)` for `a` seconds after an impact, on landings.

**Basis and projection:**

```js
const zc = norm(C - L);                      // camera looks down -zc
const x0 = norm(cross([0, 1, 0], zc)), y0 = cross(zc, x0);
// roll x0, y0 about zc by r to get xc, yc
const d = 540 / tan(fov / 2);                // perspective distance in px
// project P: v = P - C; depth = -dot(v, zc); s = d / depth
//   screen = (960 + dot(v, xc) * s, 540 + dot(v, yc) * s); skip when depth < 30
```

**The DOM camera** makes `.rig` map world P to exactly where `project` puts it:

```js
persp.style.perspective = d + 'px';
rig.style.transform = 'matrix3d(' + [xc.x, yc.x, zc.x, 0,  xc.y, yc.y, zc.y, 0,
  xc.z, yc.z, zc.z, 0,  -dot(xc, C), -dot(yc, C), -dot(zc, C) + d, 1].join(',') + ')';
```

**Placing a plane:** `translate3d(P) rotateY(ry) rotateX(rx) scale(sc) translate(-50%, -50%)`. `rx = 90` lays it flat on the floor. To face the camera, `ry = atan2(C.x − P.x, C.z − P.z)` in degrees. Hide it when it is behind or close to the camera (depth < 80) or fully transparent.

**Depth of field:** CSS `blur()` applies before projection, so divide the screen-space blur you want by the projection scale: `blur = clamp(|depth − focus| / 260, 0, 7) / s`.

**Fog:** fade opacity with depth, for example `1 − (depth − 2200) / 7000`. Fade far grid lines harder (fog cubed) or they pile into a hard line at the horizon.

**Floor:** a dot grid around the camera, snapped to the pitch so the dots stay fixed in the world, with faint lines every few dots. A per-dot function can move or light a dot: wandering noise, a ripple band, a glow around the hub. A soft light pool is a radial gradient drawn under the affine transform built from three projected points (centre, centre + r on x, centre + r on z).

**Glow:** `drop-shadow(0 0 10px ice) drop-shadow(0 0 36px ice / .55)` on ice planes; radial gradients on the fx canvas; a pin's prism sides on the floor canvas, under its DOM top face.

**Whip blur:** project a point 1500 units ahead of this frame's camera through the previous frame's camera; the screen offset is the swing. Apply `feGaussianBlur stdDeviation="sx sy"` through a per-shot `<filter id>` on `.world` only above a threshold, `max(0, offset − 30) · 0.45`, so ordinary moves stay sharp.

**Stacked depth (layered letters):** copies stepping back with `translateZ`, darkening as they go. Opacity flattens a 3D stack and paints in DOM order, so put the front copy last.

## 5. Checks

During the build, preview each shot alone in a scratch page (`seek` exposed on `window`) and screenshot it:

- one still per beat, plus mid-move frames and both ends of the shot;
- a backward seek: the same time, revisited after seeking to 0, gives identical pixels.

After `kinotta build`, check the built `v<n>/index.html?render` in a browser:

- each shot's still at its start time, all five showing content;
- the backward seek again across the whole reel;
- move one scene inside the reel's length and confirm it shows only in its new range, then restore it;
- `elementFromPoint` at the centre of each important `data-el` lands on that element;
- no page errors.

Then run `kinotta check <slug>` and `kinotta render <slug> v<n> --preset draft`. Compare a row of frames from the render against the quality bar the owner named, and give the owner the sheet. A published revision is immutable: a fix is a new revision and a new version, never an edit in place.
