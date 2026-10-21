import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BROLL_LEVELS,
  CAPTIONS_MODES,
  clearOverride,
  computeBrollPlan,
  defaultSimpleOptions,
  getVideoType,
  loadSimpleOptions,
  PACE_LEVELS,
  readSimpleOptions,
  saveSimpleOptions,
  serializeSimpleOptions,
  setDial,
  setVideoType,
  STORAGE_KEY,
  validateSimpleOptions,
  VIDEO_TYPES,
  type SimpleOptionsState,
  type VideoTypeId,
} from '../../web/src/simple-options.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('simple-options', () => {
  describe('video types and defaults', () => {
    it('defines exactly the 8 specified video types with labels, descriptions, and defaults', () => {
      expect(VIDEO_TYPES).toHaveLength(8);

      const expectedTypes = [
        {
          id: 'decide',
          label: 'Let Kinotta decide',
          description: 'Guesses from the video',
          defaults: { broll: 'medium', captions: 'phrases', pace: 'normal' },
        },
        {
          id: 'explainer',
          label: 'Explainer',
          description: 'Full-frame cutaways, punch-ins over jump cuts',
          defaults: { broll: 'medium', captions: 'phrases', pace: 'normal' },
        },
        {
          id: 'interview',
          label: 'Interview',
          description: 'Cut between speakers, visuals on visual topics',
          defaults: { broll: 'light', captions: 'phrases', pace: 'calm' },
        },
        {
          id: 'tutorial',
          label: 'Tutorial',
          description: 'Screen stays main; zooms and callouts inside it',
          defaults: { broll: 'light', captions: 'phrases', pace: 'calm' },
        },
        {
          id: 'demo',
          label: 'Product demo',
          description: 'Product first, the pitch in the first 3 s',
          defaults: { broll: 'medium', captions: 'phrases', pace: 'normal' },
        },
        {
          id: 'short',
          label: 'Short',
          description: 'Full frame, hook in 3 s, text clear of app buttons',
          defaults: { broll: 'heavy', captions: 'word by word', pace: 'fast' },
        },
        {
          id: 'lecture',
          label: 'Lecture',
          description: 'Talking head alternating with slides or drawing',
          defaults: { broll: 'medium', captions: 'phrases', pace: 'calm' },
        },
        {
          id: 'vlog',
          label: 'Vlog',
          description: 'Sparse graphics, authentic over polished',
          defaults: { broll: 'light', captions: 'off', pace: 'calm' },
        },
      ];

      expect(VIDEO_TYPES.map((t) => ({ ...t }))).toEqual(expectedTypes);
    });

    it('retrieves video type definition by id', () => {
      expect(getVideoType('demo')).toMatchObject({
        id: 'demo',
        label: 'Product demo',
      });
      expect(getVideoType('unknown')).toBeUndefined();
    });

    it('initializes default options with decide type and untouched dials', () => {
      const state = defaultSimpleOptions();
      expect(state).toEqual({
        videoType: 'decide',
        broll: 'medium',
        captions: 'phrases',
        pace: 'normal',
        overridden: {
          broll: false,
          captions: false,
          pace: false,
        },
      });
    });

    it('updates untouched dials when switching through each of the 8 types', () => {
      let state = defaultSimpleOptions();

      for (const def of VIDEO_TYPES) {
        state = setVideoType(state, def.id);
        expect(state.videoType).toBe(def.id);
        expect(state.broll).toBe(def.defaults.broll);
        expect(state.captions).toBe(def.defaults.captions);
        expect(state.pace).toBe(def.defaults.pace);
        expect(state.overridden).toEqual({
          broll: false,
          captions: false,
          pace: false,
        });
      }
    });
  });

  describe('override rules and stickiness', () => {
    it('marks a dial as overridden when changed', () => {
      const initial = defaultSimpleOptions();
      const updated = setDial(initial, 'pace', 'fast');

      expect(updated.pace).toBe('fast');
      expect(updated.overridden.pace).toBe(true);
      expect(updated.overridden.broll).toBe(false);
      expect(updated.overridden.captions).toBe(false);
    });

    it('leaves overridden dials intact while updating untouched dials when changing type', () => {
      // Start at decide (defaults: medium, phrases, normal)
      let state = defaultSimpleOptions();

      // Override pace to fast
      state = setDial(state, 'pace', 'fast');
      expect(state.overridden.pace).toBe(true);

      // Switch to interview (defaults: light, phrases, calm)
      state = setVideoType(state, 'interview');
      expect(state.videoType).toBe('interview');
      expect(state.broll).toBe('light'); // untouched: updated to interview default
      expect(state.captions).toBe('phrases'); // untouched: updated to interview default
      expect(state.pace).toBe('fast'); // overridden: preserved
      expect(state.overridden.pace).toBe(true);

      // Switch to tutorial (defaults: light, phrases, calm)
      state = setVideoType(state, 'tutorial');
      expect(state.videoType).toBe('tutorial');
      expect(state.pace).toBe('fast'); // preserved

      // Now override broll to heavy
      state = setDial(state, 'broll', 'heavy');
      expect(state.overridden.broll).toBe(true);

      // Switch to vlog (defaults: light, off, calm)
      state = setVideoType(state, 'vlog');
      expect(state.videoType).toBe('vlog');
      expect(state.captions).toBe('off'); // untouched: updated to vlog default
      expect(state.broll).toBe('heavy'); // overridden: preserved
      expect(state.pace).toBe('fast'); // overridden: preserved
    });

    it('keeps overridden dials sticky even if the value equals the new type default', () => {
      let state = defaultSimpleOptions();

      // Override pace to calm
      state = setDial(state, 'pace', 'calm');
      expect(state.pace).toBe('calm');
      expect(state.overridden.pace).toBe(true);

      // Switch to interview, whose default pace is already calm
      state = setVideoType(state, 'interview');
      expect(state.videoType).toBe('interview');
      expect(state.pace).toBe('calm');
      // Stickiness check: overridden flag must remain true!
      expect(state.overridden.pace).toBe(true);

      // Switch to short, whose default pace is fast
      state = setVideoType(state, 'short');
      expect(state.videoType).toBe('short');
      // Pace must remain calm because it was marked overridden
      expect(state.pace).toBe('calm');
      expect(state.overridden.pace).toBe(true);
      // Untouched dials (broll, captions) update to short defaults (heavy, word by word)
      expect(state.broll).toBe('heavy');
      expect(state.captions).toBe('word by word');
    });

    it('resets a dial to type defaults when clearOverride is used', () => {
      let state = defaultSimpleOptions();
      state = setVideoType(state, 'short'); // default pace is fast
      state = setDial(state, 'pace', 'calm');
      expect(state.pace).toBe('calm');
      expect(state.overridden.pace).toBe(true);

      state = clearOverride(state, 'pace');
      expect(state.pace).toBe('fast'); // reset to short's default
      expect(state.overridden.pace).toBe(false);
    });
  });

  describe('serialization for Make', () => {
    it('omits videoType when type is decide', () => {
      const state = defaultSimpleOptions();
      const serialized = serializeSimpleOptions(state);

      expect(serialized).toEqual({
        broll: 'medium',
        captions: 'phrases',
        pace: 'normal',
      });
      expect('videoType' in serialized).toBe(false);
    });

    it('serializes product demo as demo, NOT product-demo', () => {
      let state = defaultSimpleOptions();
      state = setVideoType(state, 'demo');

      const serialized = serializeSimpleOptions(state);
      expect(serialized.videoType).toBe('demo');
      expect(serialized).not.toHaveProperty('product-demo');
      expect(serialized).toEqual({
        videoType: 'demo',
        broll: 'medium',
        captions: 'phrases',
        pace: 'normal',
      });
    });

    it('serializes all other video types correctly', () => {
      const typesToTest: Array<Exclude<VideoTypeId, 'decide'>> = [
        'explainer',
        'interview',
        'tutorial',
        'demo',
        'short',
        'lecture',
        'vlog',
      ];

      for (const type of typesToTest) {
        let state = defaultSimpleOptions();
        state = setVideoType(state, type);
        const serialized = serializeSimpleOptions(state);
        expect(serialized.videoType).toBe(type);
      }
    });

    it('omits notes when empty, whitespace, or undefined', () => {
      const state = defaultSimpleOptions();

      expect(serializeSimpleOptions(state)).not.toHaveProperty('notes');
      expect(serializeSimpleOptions(state, '')).not.toHaveProperty('notes');
      expect(serializeSimpleOptions(state, '   ')).not.toHaveProperty('notes');
      expect(serializeSimpleOptions(state, '\t \n ')).not.toHaveProperty('notes');
      expect(serializeSimpleOptions(state, undefined)).not.toHaveProperty('notes');
      expect(serializeSimpleOptions(state, null)).not.toHaveProperty('notes');
    });

    it('trims and includes notes when non-blank', () => {
      const state = defaultSimpleOptions();

      const result1 = serializeSimpleOptions(state, '  keep the jokes, use my logo at the end  ');
      expect(result1.notes).toBe('keep the jokes, use my logo at the end');

      const result2 = serializeSimpleOptions({
        videoType: 'explainer',
        broll: 'heavy',
        captions: 'word by word',
        pace: 'fast',
        notes: '   punch in on the key points   ',
      });
      expect(result2.notes).toBe('punch in on the key points');
      expect(result2.videoType).toBe('explainer');
    });
  });

  describe('versioned browser storage', () => {
    it('saves preferences to the exact key and restores them', () => {
      const store = new Map<string, string>();
      vi.stubGlobal('window', {
        localStorage: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => store.set(key, value),
        },
      });

      let state = defaultSimpleOptions();
      state = setVideoType(state, 'interview');
      state = setDial(state, 'pace', 'fast');

      saveSimpleOptions(state);

      expect(store.has(STORAGE_KEY)).toBe(true);
      const rawStored = JSON.parse(store.get(STORAGE_KEY)!);
      expect(rawStored).toEqual({
        version: 1,
        videoType: 'interview',
        broll: 'light',
        captions: 'phrases',
        pace: 'fast',
        overridden: {
          broll: false,
          captions: false,
          pace: true,
        },
      });

      const loaded = readSimpleOptions();
      expect(loaded).toEqual(state);
      expect(loadSimpleOptions()).toEqual(state);
    });

    it('never persists notes or video paths even if present on state', () => {
      const store = new Map<string, string>();
      vi.stubGlobal('window', {
        localStorage: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => store.set(key, value),
        },
      });

      const stateWithExtras = {
        ...defaultSimpleOptions(),
        notes: 'do not store me',
        video: '/path/to/video.mp4',
        selectedPath: '/local/file.mov',
      };

      saveSimpleOptions(stateWithExtras as unknown as SimpleOptionsState);

      const raw = JSON.parse(store.get(STORAGE_KEY)!);
      expect(raw).not.toHaveProperty('notes');
      expect(raw).not.toHaveProperty('video');
      expect(raw).not.toHaveProperty('selectedPath');

      const loaded = readSimpleOptions();
      expect(loaded).not.toHaveProperty('notes');
      expect(loaded).not.toHaveProperty('video');
    });

    it('falls back to safe defaults when localStorage contains corrupted or malformed data', () => {
      const store = new Map<string, string>();
      vi.stubGlobal('window', {
        localStorage: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => store.set(key, value),
        },
      });

      // Completely unparseable JSON
      store.set(STORAGE_KEY, '{invalid json');
      expect(readSimpleOptions()).toEqual(defaultSimpleOptions());

      // Primitive string or number or array
      store.set(STORAGE_KEY, '"just a string"');
      expect(readSimpleOptions()).toEqual(defaultSimpleOptions());

      store.set(STORAGE_KEY, '[1, 2, 3]');
      expect(readSimpleOptions()).toEqual(defaultSimpleOptions());

      // Object with unknown videoType and corrupt dials
      store.set(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          videoType: 'podcast',
          broll: 'ultra-heavy',
          captions: 'neon',
          pace: 'warp',
          overridden: 'not-an-object',
        }),
      );
      expect(readSimpleOptions()).toEqual(defaultSimpleOptions());
    });

    it('validates partial fields and preserves valid selections with type defaults for corrupted ones', () => {
      const partial = validateSimpleOptions({
        videoType: 'short',
        broll: 'corrupt',
        captions: 'word by word',
        overridden: {
          captions: true,
          broll: true,
        },
      });

      expect(partial.videoType).toBe('short');
      // broll corrupted -> reset to short's default (heavy), override flag cleared
      expect(partial.broll).toBe('heavy');
      expect(partial.overridden.broll).toBe(false);
      // captions valid -> restored, override flag preserved
      expect(partial.captions).toBe('word by word');
      expect(partial.overridden.captions).toBe(true);
      // pace missing -> short's default (fast), override flag false
      expect(partial.pace).toBe('fast');
      expect(partial.overridden.pace).toBe(false);
    });

    it('safely handles blocked or throwing localStorage', () => {
      // localStorage getter throws SecurityError
      vi.stubGlobal('window', {
        get localStorage() {
          throw new Error('SecurityError: Access is denied for this document');
        },
      });

      expect(() => readSimpleOptions()).not.toThrow();
      expect(readSimpleOptions()).toEqual(defaultSimpleOptions());

      expect(() => saveSimpleOptions(defaultSimpleOptions())).not.toThrow();
    });

    it('returns an independent copy of default options so callers cannot mutate defaults', () => {
      vi.stubGlobal('window', {
        localStorage: {
          getItem: () => null,
          setItem: () => {},
        },
      });

      const first = readSimpleOptions();
      first.pace = 'fast';
      first.overridden.pace = true;

      const second = readSimpleOptions();
      expect(second.pace).toBe('normal');
      expect(second.overridden.pace).toBe(false);
    });
  });

  describe('computeBrollPlan and visual pacing targets', () => {
    it('computes cutaway slots, target coverage, and actual coverage for preview', () => {
      const plan = computeBrollPlan('medium', 'normal', 60);

      expect(plan.targetShotDuration).toBe(3.0);
      expect(plan.targetCoverage).toBe(0.40);
      expect(plan.cutawayCount).toBeGreaterThan(0);
      expect(plan.actualCoverage).toBeGreaterThan(0.2);
      expect(plan.actualCoverage).toBeLessThanOrEqual(0.6);

      for (const slot of plan.slots) {
        expect(slot.duration).toBe(3.0);
        expect(slot.start).toBeGreaterThanOrEqual(0);
        expect(slot.start + slot.duration).toBeLessThanOrEqual(60);
      }
    });

    it('handles zero or negative duration gracefully', () => {
      const planZero = computeBrollPlan('light', 'calm', 0);
      expect(planZero.slots).toEqual([]);
      expect(planZero.cutawayCount).toBe(0);
      expect(planZero.actualCoverage).toBe(0);

      const planNegative = computeBrollPlan('heavy', 'fast', -10);
      expect(planNegative.slots).toEqual([]);
      expect(planNegative.cutawayCount).toBe(0);
    });
  });
});
