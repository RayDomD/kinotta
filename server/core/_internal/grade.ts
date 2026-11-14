import { KinottaError } from './errors.ts';

export type GradeRgb = [number, number, number];
export interface GradeValues {
  exposure: number;
  temperature: number;
  tint: number;
  contrast: number;
  saturation: number;
  blacks: number;
  mids: number;
  whites: number;
  shadowsColor: GradeRgb;
  midtonesColor: GradeRgb;
  highlightsColor: GradeRgb;
}
export type Grade = Partial<GradeValues>;
export type GradeChanges = { [K in keyof GradeValues]?: GradeValues[K] | null };
export const GRADE_SPEC = {
  exposure: { min: -3, max: 3, default: 0 },
  temperature: { min: 2500, max: 12000, default: 6500 },
  tint: { min: -0.3, max: 0.3, default: 0 },
  contrast: { min: 0.5, max: 2, default: 1 },
  saturation: { min: 0, max: 2, default: 1 },
  blacks: { min: -0.2, max: 0.2, default: 0 },
  mids: { min: -1, max: 1, default: 0 },
  whites: { min: -0.3, max: 0.3, default: 0 },
  shadowsColor: { min: -1, max: 1, default: [0, 0, 0] as GradeRgb },
  midtonesColor: { min: -1, max: 1, default: [0, 0, 0] as GradeRgb },
  highlightsColor: { min: -1, max: 1, default: [0, 0, 0] as GradeRgb },
};

export function validateGrade(value: unknown, changes = false): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new KinottaError('invalid', 'Grade must be an object of named values.');
  for (const [key, entry] of Object.entries(value)) {
    if (!Object.hasOwn(GRADE_SPEC, key)) throw new KinottaError('invalid', `Unknown grade key ${key}. Known keys: ${Object.keys(GRADE_SPEC).join(', ')}.`);
    const spec = GRADE_SPEC[key as keyof GradeValues];
    if (changes && entry === null) continue;
    const inRange = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= spec.min && v <= spec.max;
    const rgb = Array.isArray(spec.default);
    if (!(rgb ? Array.isArray(entry) && entry.length === 3 && [0, 1, 2].every((i) => inRange(entry[i])) : inRange(entry))) {
      throw new KinottaError('invalid', `Grade ${key} must be ${rgb ? '[r, g, b], each ' : ''}between ${spec.min} and ${spec.max}.`);
    }
  }
}

export function mergeGrade(current: Grade | undefined, changes: GradeChanges): Grade | undefined {
  validateGrade(changes, true);
  const next = { ...current, ...changes };
  for (const key of Object.keys(next) as Array<keyof GradeValues>) {
    if (next[key] === null || JSON.stringify(next[key]) === JSON.stringify(GRADE_SPEC[key].default)) delete next[key];
  }
  return Object.keys(next).length ? structuredClone(next) as Grade : undefined;
}

const rounded = (value: number) => Math.round(value * 1000) / 1000;

export function gradeFilters(grade: Grade = {}): string {
  const g = Object.fromEntries(Object.entries(GRADE_SPEC).map(([key, spec]) => [key, grade[key as keyof GradeValues] ?? spec.default])) as unknown as GradeValues;
  const parts: string[] = [];
  if (g.exposure) parts.push(`exposure=exposure=${rounded(g.exposure)}`);
  if (g.temperature !== GRADE_SPEC.temperature.default) parts.push(`colortemperature=temperature=${rounded(g.temperature)}`);
  const levels: string[] = [];
  const level = (suffix: string, value: number) => levels.push(['r', 'g', 'b'].map((channel) => `${channel}${suffix}=${rounded(value)}`).join(':'));
  if (g.blacks < 0) level('imin', -g.blacks);
  if (g.blacks > 0) level('omin', g.blacks);
  if (g.whites > 0) level('imax', 1 - g.whites);
  if (g.whites < 0) level('omax', 1 + g.whites);
  if (levels.length) parts.push(`colorlevels=${levels.join(':')}`);
  const eq: string[] = [];
  if (g.contrast !== GRADE_SPEC.contrast.default) eq.push(`contrast=${rounded(g.contrast)}`);
  if (g.saturation !== GRADE_SPEC.saturation.default) eq.push(`saturation=${rounded(g.saturation)}`);
  if (g.mids) eq.push(`gamma=${rounded(2 ** g.mids)}`);
  if (eq.length) parts.push(`eq=${eq.join(':')}`);
  const mid = [g.midtonesColor[0] + g.tint / 2, g.midtonesColor[1] - g.tint, g.midtonesColor[2] + g.tint / 2];
  const balance = [
    ...g.shadowsColor.map((v, i) => [['rs', 'gs', 'bs'][i], v] as const),
    ...mid.map((v, i) => [['rm', 'gm', 'bm'][i], v] as const),
    ...g.highlightsColor.map((v, i) => [['rh', 'gh', 'bh'][i], v] as const),
  ].filter(([, v]) => v !== 0).map(([key, v]) => `${key}=${rounded(Math.max(-1, Math.min(1, v)))}`);
  if (balance.length) parts.push(`colorbalance=${balance.join(':')}`);
  return parts.join(',');
}
