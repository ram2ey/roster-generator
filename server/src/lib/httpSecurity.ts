const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isAllowedRequestOrigin(method: string, path: string, origin: string | undefined, appOrigin: string): boolean {
  if (!MUTATION_METHODS.has(method)) return true;
  if (path.split("?", 1)[0] === "/api/billing/webhook") return true;
  return origin === appOrigin;
}

export function configuredTrustProxy(value: string | undefined): false | string | ((address: string, hop: number) => boolean) {
  const normalized = value?.trim();
  if (!normalized) return false;
  if (/^[1-9]\d*$/.test(normalized)) {
    const hops = Number(normalized);
    return (_address, hop) => hop < hops;
  }
  return normalized;
}
