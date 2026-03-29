import { isIP } from "node:net";

import type { Request } from "express";

const UNKNOWN_IP = "unknown";

const stripForwardedPrefix = (value: string): string => {
  const trimmedValue = value.trim();
  if (!trimmedValue.toLowerCase().startsWith("for=")) {
    return trimmedValue;
  }

  return trimmedValue.slice(4).trim();
};

const unquote = (value: string): string => {
  if (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2) {
    return value.slice(1, -1);
  }

  return value;
};

const extractBracketedIp = (value: string): string => {
  if (!value.startsWith("[")) {
    return value;
  }

  const closingBracketIndex = value.indexOf("]");
  if (closingBracketIndex <= 1) {
    return value;
  }

  return value.slice(1, closingBracketIndex);
};

const stripIpv4Port = (value: string): string => {
  const ipv4WithPortPattern = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/;
  const match = value.match(ipv4WithPortPattern);
  if (!match) {
    return value;
  }

  return match[1];
};

const normalizeIpv4MappedIpv6 = (value: string): string => {
  const normalizedValue = value.toLowerCase();
  if (!normalizedValue.startsWith("::ffff:")) {
    return value;
  }

  return value.slice("::ffff:".length);
};

export const sanitizeIpCandidate = (value: string): string => {
  const withoutPrefix = stripForwardedPrefix(value);
  const withoutQuotes = unquote(withoutPrefix);
  const withoutBrackets = extractBracketedIp(withoutQuotes);
  const withoutPort = stripIpv4Port(withoutBrackets);
  return normalizeIpv4MappedIpv6(withoutPort.trim());
};

export const isPrivateIp = (ipAddress: string): boolean => {
  const version = isIP(ipAddress);
  if (version === 0) {
    return true;
  }

  if (version === 4) {
    const octets = ipAddress.split(".").map((segment): number => Number(segment));
    const [a, b] = octets;
    if (a === 10 || a === 127 || a === 0) {
      return true;
    }
    if (a === 169 && b === 254) {
      return true;
    }
    if (a === 192 && b === 168) {
      return true;
    }
    if (a === 172 && b >= 16 && b <= 31) {
      return true;
    }
    if (a === 100 && b >= 64 && b <= 127) {
      return true;
    }

    return false;
  }

  const normalized = ipAddress.toLowerCase();
  if (normalized === "::1") {
    return true;
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
    return true;
  }
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  return false;
};

const toCandidateList = (
  headerValue: string | string[] | undefined,
): string[] => {
  if (!headerValue) {
    return [];
  }

  if (Array.isArray(headerValue)) {
    return headerValue.flatMap((entry): string[] => {
      return entry.split(",").map((candidate): string => candidate.trim());
    });
  }

  return headerValue.split(",").map((candidate): string => candidate.trim());
};

export const getClientIp = (req: Request): string => {
  const forwardedHeader = req.headers["x-forwarded-for"];
  const forwardedCandidates = toCandidateList(forwardedHeader);
  const fallbackCandidates: string[] = [req.ip ?? "", req.socket.remoteAddress ?? ""];

  const allCandidates = [...forwardedCandidates, ...fallbackCandidates]
    .map((candidate): string => sanitizeIpCandidate(candidate))
    .filter((candidate): boolean => isIP(candidate) !== 0);

  const firstPublicIp = allCandidates.find((candidate): boolean => {
    return !isPrivateIp(candidate);
  });
  if (firstPublicIp) {
    return firstPublicIp;
  }

  return allCandidates[0] ?? UNKNOWN_IP;
};
