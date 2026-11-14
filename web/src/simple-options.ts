/**
 * Simple mode video types, dials, overrides, serialization, and browser storage persistence.
 */

export const VIDEO_TYPES = [
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
] as const;

export type VideoTypeId = (typeof VIDEO_TYPES)[number]['id'];

export interface VideoTypeDefinition {
  readonly id: VideoTypeId;
  readonly label: string;
  readonly description: string;
  readonly defaults: {
    readonly broll: BrollLevel;
    readonly captions: CaptionsMode;
    readonly pace: PaceLevel;
  };
}

export type BrollLevel = 'light' | 'medium' | 'heavy';
export type CaptionsMode = 'off' | 'phrases' | 'word by word';
export type PaceLevel = 'calm' | 'normal' | 'fast';

export const BROLL_LEVELS: readonly BrollLevel[] = ['light', 'medium', 'heavy'];
export const CAPTIONS_MODES: readonly CaptionsMode[] = ['off', 'phrases', 'word by word'];
export const PACE_LEVELS: readonly PaceLevel[] = ['calm', 'normal', 'fast'];

export type DialKey = 'broll' | 'captions' | 'pace';

export interface DialValues {
  broll: BrollLevel;
  captions: CaptionsMode;
  pace: PaceLevel;
}

export interface OverriddenDials {
  broll: boolean;
  captions: boolean;
  pace: boolean;
}

export interface SimpleOptionsState {
  videoType: VideoTypeId;
  broll: BrollLevel;
  captions: CaptionsMode;
  pace: PaceLevel;
  overridden: OverriddenDials;
}

export const DEFAULT_VIDEO_TYPE: VideoTypeId = 'decide';

export function getVideoType(id: string): VideoTypeDefinition | undefined {
  return VIDEO_TYPES.find((type) => type.id === id);
}

export function defaultSimpleOptions(): SimpleOptionsState {
  const typeDef = VIDEO_TYPES.find((t) => t.id === DEFAULT_VIDEO_TYPE)!;
  return {
    videoType: DEFAULT_VIDEO_TYPE,
    broll: typeDef.defaults.broll,
    captions: typeDef.defaults.captions,
    pace: typeDef.defaults.pace,
    overridden: {
      broll: false,
      captions: false,
      pace: false,
    },
  };
}

/**
 * Switching the video type changes only untouched dials; overridden dials keep their values.
 * Overridden dials remain sticky even if their value equals the new type's default.
 */
export function setVideoType(state: SimpleOptionsState, newType: VideoTypeId): SimpleOptionsState {
  const typeDef = VIDEO_TYPES.find((t) => t.id === newType);
  if (!typeDef) return state;

  return {
    ...state,
    videoType: newType,
    broll: state.overridden.broll ? state.broll : typeDef.defaults.broll,
    captions: state.overridden.captions ? state.captions : typeDef.defaults.captions,
    pace: state.overridden.pace ? state.pace : typeDef.defaults.pace,
    overridden: { ...state.overridden },
  };
}

/**
 * Changing a dial marks it overridden ("yours").
 */
export function setDial<K extends DialKey>(
  state: SimpleOptionsState,
  dial: K,
  value: DialValues[K],
): SimpleOptionsState {
  return {
    ...state,
    [dial]: value,
    overridden: {
      ...state.overridden,
      [dial]: true,
    },
  };
}

/**
 * Clears an override and resets that dial back to the current video type's default.
 */
export function clearOverride(state: SimpleOptionsState, dial: DialKey): SimpleOptionsState {
  const typeDef = VIDEO_TYPES.find((t) => t.id === state.videoType) ?? VIDEO_TYPES[0]!;
  return {
    ...state,
    [dial]: typeDef.defaults[dial],
    overridden: {
      ...state.overridden,
      [dial]: false,
    },
  };
}

export interface SerializedSimpleOptions {
  videoType?: Exclude<VideoTypeId, 'decide'>;
  broll: BrollLevel;
  captions: CaptionsMode;
  pace: PaceLevel;
  notes?: string;
}

export interface SimpleMakeInput {
  videoType: VideoTypeId;
  broll: BrollLevel;
  captions: CaptionsMode;
  pace: PaceLevel;
  notes?: string | null;
}

/**
 * Serializes options for Make:
 * - Omits videoType if 'decide'
 * - Serializes 'demo' as 'demo' (not 'product-demo')
 * - Omits notes if empty or whitespace-only; otherwise trims
 */
export function serializeSimpleOptions(
  options: SimpleOptionsState | SimpleMakeInput,
  notesArg?: string | null,
): SerializedSimpleOptions {
  const notesCandidate = notesArg !== undefined ? notesArg : ('notes' in options ? options.notes : undefined);
  const trimmed = typeof notesCandidate === 'string' ? notesCandidate.trim() : '';

  const result: SerializedSimpleOptions = {
    broll: options.broll,
    captions: options.captions,
    pace: options.pace,
  };

  if (options.videoType !== 'decide') {
    result.videoType = options.videoType;
  }

  if (trimmed.length > 0) {
    result.notes = trimmed;
  }

  return result;
}

export const STORAGE_KEY = 'kinotta-simple-options-v1';
export const MIGRATED_STORAGE_KEY = 'kinotta-simple-options-migrated';
let profileMigration: Promise<void> | undefined;

/** Keep the old browser profile; mark it migrated only after the server has saved its copy. */
export function migrateSimpleOptionsProfile(migrate: (profile: unknown) => Promise<unknown>): Promise<void> {
  if (profileMigration) return profileMigration;
  profileMigration = (async () => {
    try {
      if (typeof window === 'undefined') return;
      const storage = window.localStorage;
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null || storage.getItem(MIGRATED_STORAGE_KEY) !== null) return;
      await migrate(JSON.parse(raw));
      storage.setItem(MIGRATED_STORAGE_KEY, 'true');
    } catch {
      // Keep the source and retry on a later load if storage or the server is unavailable.
    }
  })().finally(() => { profileMigration = undefined; });
  return profileMigration;
}

export function validateSimpleOptions(value: unknown): SimpleOptionsState {
  const fallback = defaultSimpleOptions();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  const raw = value as Record<string, unknown>;

  const videoType: VideoTypeId =
    typeof raw.videoType === 'string' && VIDEO_TYPES.some((t) => t.id === raw.videoType)
      ? (raw.videoType as VideoTypeId)
      : fallback.videoType;

  const typeDef = VIDEO_TYPES.find((t) => t.id === videoType)!;

  const rawOverridden =
    raw.overridden && typeof raw.overridden === 'object' && !Array.isArray(raw.overridden)
      ? (raw.overridden as Record<string, unknown>)
      : {};

  const isBrollValid = typeof raw.broll === 'string' && BROLL_LEVELS.includes(raw.broll as BrollLevel);
  const isCaptionsValid = typeof raw.captions === 'string' && CAPTIONS_MODES.includes(raw.captions as CaptionsMode);
  const isPaceValid = typeof raw.pace === 'string' && PACE_LEVELS.includes(raw.pace as PaceLevel);

  const overridden: OverriddenDials = {
    broll: isBrollValid ? Boolean(rawOverridden.broll) : false,
    captions: isCaptionsValid ? Boolean(rawOverridden.captions) : false,
    pace: isPaceValid ? Boolean(rawOverridden.pace) : false,
  };

  const broll: BrollLevel = isBrollValid ? (raw.broll as BrollLevel) : typeDef.defaults.broll;
  const captions: CaptionsMode = isCaptionsValid ? (raw.captions as CaptionsMode) : typeDef.defaults.captions;
  const pace: PaceLevel = isPaceValid ? (raw.pace as PaceLevel) : typeDef.defaults.pace;

  return {
    videoType,
    broll,
    captions,
    pace,
    overridden,
  };
}

/**
 * Loads preferences from localStorage, falling back safely on missing, corrupted, or blocked storage.
 * Does not load notes or video paths.
 */
export function readSimpleOptions(): SimpleOptionsState {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return defaultSimpleOptions();
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSimpleOptions();
    return validateSimpleOptions(JSON.parse(raw));
  } catch {
    return defaultSimpleOptions();
  }
}

export const loadSimpleOptions = readSimpleOptions;

/**
 * Saves preferences (selected type, dial values, override flags) to versioned browser storage.
 * Never persists notes or video paths.
 */
export function saveSimpleOptions(state: SimpleOptionsState): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    const toStore = {
      version: 1,
      videoType: state.videoType,
      broll: state.broll,
      captions: state.captions,
      pace: state.pace,
      overridden: {
        broll: Boolean(state.overridden?.broll),
        captions: Boolean(state.overridden?.captions),
        pace: Boolean(state.overridden?.pace),
      },
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Storage blocked or quota exceeded: ignore safely
  }
}

// Visual pacing and b-roll target helpers for live preview and agent handoff:
export const BROLL_COVERAGE: Record<BrollLevel, number> = {
  light: 0.20,
  medium: 0.40,
  heavy: 0.60,
};

export const PACE_SHOT_DURATION: Record<PaceLevel, number> = {
  calm: 5.5,
  normal: 3.0,
  fast: 1.4,
};

export const DIAL_DESCRIPTIONS = {
  broll: {
    light: 'about 20% of the reel covered',
    medium: 'about 40% covered',
    heavy: 'about 60% covered',
  },
  pace: {
    calm: 'shots hold ~5–6 s, few cuts',
    normal: 'shots hold ~3 s',
    fast: 'shots flash ~1–2 s, rapid cuts',
  },
} as const;

export interface BrollPlanSlot {
  start: number;
  duration: number;
}

export interface BrollPlan {
  slots: BrollPlanSlot[];
  targetCoverage: number;
  actualCoverage: number;
  targetShotDuration: number;
  cutawayCount: number;
}

export function computeBrollPlan(broll: BrollLevel, pace: PaceLevel, totalDuration: number): BrollPlan {
  const shot = PACE_SHOT_DURATION[pace];
  const coverageRate = BROLL_COVERAGE[broll];
  if (totalDuration <= 0) {
    return {
      slots: [],
      targetCoverage: coverageRate,
      actualCoverage: 0,
      targetShotDuration: shot,
      cutawayCount: 0,
    };
  }

  const targetCoverSeconds = coverageRate * totalDuration;
  const count = Math.max(1, Math.round(targetCoverSeconds / shot));
  const slots: BrollPlanSlot[] = [];
  const gap = (totalDuration - targetCoverSeconds) / (count + 1);
  let x = gap * 0.6 + 1;

  for (let i = 0; i < count; i++) {
    if (x + shot <= totalDuration) {
      slots.push({ start: x, duration: shot });
    }
    x += shot + gap * (i % 2 ? 1.3 : 0.7);
  }

  const totalCovered = slots.reduce((acc, slot) => acc + slot.duration, 0);

  return {
    slots,
    targetCoverage: coverageRate,
    actualCoverage: totalCovered / totalDuration,
    targetShotDuration: shot,
    cutawayCount: slots.length,
  };
}
