"use strict";

// Playwright treats a spec path as a regular expression. On Windows, "\test"
// becomes a tab, so the file is skipped with "No tests found". Rewrite those
// paths before RegExp compiles them. The filter export cannot be replaced.

const fs = require("node:fs");
const path = require("node:path");

const NativeRegExp = RegExp;

function looksLikeWindowsTestPath(pattern) {
  if (typeof pattern !== "string" || !pattern.includes("\\")) return false;
  const slashed = pattern.replaceAll("\\", "/");
  return /(?:^|\/)[^/]+\.(?:spec|setup)\.js$/i.test(slashed) || /^[A-Za-z]:\//.test(slashed);
}

function toForwardSlashes(pattern) {
  const slashed = pattern.replaceAll("\\", "/");
  const absolute = path.resolve(slashed);
  if (fs.existsSync(absolute)) return absolute.replaceAll("\\", "/");
  return slashed;
}

function RegExpWithWindowsPaths(pattern, flags) {
  const normalized = looksLikeWindowsTestPath(pattern) ? toForwardSlashes(pattern) : pattern;
  return new NativeRegExp(normalized, flags);
}

RegExpWithWindowsPaths.prototype = NativeRegExp.prototype;
Object.setPrototypeOf(RegExpWithWindowsPaths, NativeRegExp);
for (const key of Object.getOwnPropertyNames(NativeRegExp)) {
  if (key === "prototype" || key === "length" || key === "name") continue;
  const descriptor = Object.getOwnPropertyDescriptor(NativeRegExp, key);
  if (descriptor) {
    try {
      Object.defineProperty(RegExpWithWindowsPaths, key, descriptor);
    } catch {
      // Static helpers that cannot be copied stay on the native constructor.
    }
  }
}

globalThis.RegExp = RegExpWithWindowsPaths;
