import { KinottaError } from './errors.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((item, index) => equal(item, b[index]));
  if (!record(a) || !record(b)) return false;
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.every((key) => equal(a[key], b[key]));
};

/** Restore only fields the undone edits changed. Agent changes to those same fields need review. */
export function restoreEdit(current: unknown, from: unknown, to: unknown, path = ''): unknown {
  if (equal(from, to) || equal(current, to)) return current;
  if (equal(current, from)) return structuredClone(to);
  const conflict = (): never => { throw new KinottaError('invalid', "The agent changed the same part of the reel. Review this undo against the new version."); };
  if (Array.isArray(from) && Array.isArray(to) && Array.isArray(current)) {
    const all = [...from, ...to, ...current];
    const key = ['id', 'name', 'revision'].find((key) => all.every((item) => record(item) && typeof item[key] === 'string') && [from, to, current].every((items) => new Set(items.map((item) => item[key])).size === items.length));
    if (!key) return conflict();
    const identity = (item: Record<string, unknown>): string => String(item[key]);
    const before = new Map(from.map((item) => [identity(item), item]));
    const desired = new Map(to.map((item) => [identity(item), item]));
    const now = new Map(current.map((item) => [identity(item), item]));
    for (const id of new Set([...before.keys(), ...desired.keys()])) {
      const was = before.get(id), target = desired.get(id), value = now.get(id);
      if (equal(was, target)) continue;
      if (value === undefined && was !== undefined && target !== undefined && !path.endsWith('.alternates')) return conflict();
      const restored = value === undefined && path.endsWith('.alternates') ? target : restoreEdit(value, was, target, path);
      if (restored === undefined) now.delete(id); else now.set(id, restored);
    }
    const beforeOrder = from.map(identity), afterOrder = to.map(identity), currentOrder = current.map(identity);
    const reordered = !equal(beforeOrder.filter((id) => desired.has(id)), afterOrder.filter((id) => before.has(id)));
    if (reordered && !equal(currentOrder.filter((id) => before.has(id)), beforeOrder) && !equal(currentOrder.filter((id) => desired.has(id)), afterOrder)) return conflict();
    const order = reordered ? [...afterOrder, ...currentOrder] : [...currentOrder, ...afterOrder];
    return [...new Set(order)].filter((id) => now.has(id)).map((id) => now.get(id));
  }
  if ((record(from) || from === undefined) && (record(to) || to === undefined) && (record(current) || current === undefined)) {
    const result = { ...(record(current) ? current : {}) };
    const before = record(from) ? from : {}, desired = record(to) ? to : {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(desired)])) {
      if (equal(before[key], desired[key])) continue;
      const restored = restoreEdit(result[key], before[key], desired[key], `${path}.${key}`);
      if (restored === undefined) delete result[key]; else result[key] = restored;
    }
    return Object.keys(result).length ? result : to === undefined ? undefined : result;
  }
  return conflict();
}
