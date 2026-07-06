let counter = 0;

/** Generate a short unique id (monotonic within a session). */
export const uid = (prefix = 'rf'): string =>
  `${prefix}_${(++counter).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/** Shallow equality for plain objects. */
export const shallowEqual = (
  a: Record<string, unknown>,
  b: Record<string, unknown>
): boolean => {
  if (a === b) return true;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
};

export const setsEqual = <T>(a: Set<T>, b: Set<T>): boolean => {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
};
