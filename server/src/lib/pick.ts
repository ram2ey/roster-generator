/** Builds an update payload containing only the given allowed keys, and only
 *  the ones actually present in `body`. Used on PATCH routes so an
 *  unvalidated JSON body can't set columns beyond the ones the route means
 *  to expose (e.g. `facilityId`, which must only ever come from the
 *  session — see the comment on `facilities` in db/schema.ts). */
export function pickDefined<T extends object, K extends keyof T>(body: T, keys: readonly K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (body[key] !== undefined) result[key] = body[key];
  }
  return result;
}
