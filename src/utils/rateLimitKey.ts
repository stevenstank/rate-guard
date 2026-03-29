import { createHash } from "node:crypto";

const DEFAULT_RATE_LIMIT_KEY_PREFIX = "rate_limit";
const DEFAULT_ROUTE = "root";
const MAX_ROUTE_SEGMENT_LENGTH = 80;

const normalizeIdentifier = (identifier: string): string => {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  return normalizedIdentifier.length > 0 ? normalizedIdentifier : "unknown";
};

export const normalizeRoute = (route: string): string => {
  const routeWithoutQuery = route.split("?")[0] ?? "";
  const loweredRoute = routeWithoutQuery.trim().toLowerCase();

  if (loweredRoute.length === 0) {
    return DEFAULT_ROUTE;
  }

  return loweredRoute;
};

const hashRouteSegment = (route: string): string => {
  return createHash("sha1").update(route).digest("hex").slice(0, 16);
};

const encodeRouteSegment = (route: string): string => {
  const normalizedRoute = normalizeRoute(route);
  if (normalizedRoute.length <= MAX_ROUTE_SEGMENT_LENGTH) {
    return normalizedRoute;
  }

  // Keep long routes debuggable while avoiding oversized Redis keys.
  return `h:${hashRouteSegment(normalizedRoute)}`;
};

export const generateRateLimitKey = (
  identifier: string,
  route: string,
  prefix: string = DEFAULT_RATE_LIMIT_KEY_PREFIX,
): string => {
  const normalizedIdentifier = normalizeIdentifier(identifier);
  const routeSegment = encodeRouteSegment(route);
  const keyPrefix = prefix.trim().length > 0 ? prefix.trim() : DEFAULT_RATE_LIMIT_KEY_PREFIX;
  return `${keyPrefix}:${normalizedIdentifier}:${routeSegment}`;
};
