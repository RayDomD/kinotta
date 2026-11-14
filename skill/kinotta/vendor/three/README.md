# Three.js r170 (vendored)

A subset of [three.js](https://threejs.org/) r170 for WebGL shots in parts reels. MIT licence in `LICENSE`, kept beside the code.

- `build/three.module.js`: the core library.
- `examples/jsm/postprocessing/`: `EffectComposer`, `RenderPass`, `UnrealBloomPass`, `OutputPass` and the files they import (`Pass`, `ShaderPass`, `MaskPass`).
- `examples/jsm/shaders/`: `CopyShader`, `LuminosityHighPassShader`, `OutputShader`.

A shot source imports `three` and `three/addons/...`; `engine/bundle_shot.js` resolves both to this folder. To use another add-on, copy it and every file it imports from the same r170 release, keeping the `examples/jsm/` layout.
