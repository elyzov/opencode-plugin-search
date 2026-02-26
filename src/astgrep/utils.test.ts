import { describe, expect, test } from "bun:test";
import { type AstGrepMatch, formatMatchesAsText, getSupportedLanguages } from "./utils";

describe("utils", () => {
  describe("formatMatchesAsText", () => {
    test("returns empty string for empty matches", () => {
      expect(formatMatchesAsText([])).toBe("");
    });

    test("formats single-line matches correctly", () => {
      const matches: AstGrepMatch[] = [
        {
          file: "src/test.js",
          range: { start: { line: 5, column: 0, index: 0 }, end: { line: 5, column: 10, index: 10 } },
          text: "const x = 5",
          language: "javascript",
        },
      ];
      const result = formatMatchesAsText(matches);
      expect(result).toBe("src/test.js:6\nconst x = 5");
    });

    test("formats multi-line matches correctly", () => {
      const matches: AstGrepMatch[] = [
        {
          file: "src/test.js",
          range: { start: { line: 5, column: 0, index: 0 }, end: { line: 7, column: 10, index: 50 } },
          text: "function test() {\n  return 42;\n}",
          language: "javascript",
        },
      ];
      const result = formatMatchesAsText(matches);
      expect(result).toBe("src/test.js:6-8\nfunction test() {\n  return 42;\n}");
    });

    test("formats multiple matches with blank lines", () => {
      const matches: AstGrepMatch[] = [
        {
          file: "src/a.js",
          range: { start: { line: 0, column: 0, index: 0 }, end: { line: 0, column: 5, index: 5 } },
          text: "const a",
          language: "javascript",
        },
        {
          file: "src/b.js",
          range: { start: { line: 1, column: 0, index: 0 }, end: { line: 1, column: 5, index: 5 } },
          text: "const b",
          language: "javascript",
        },
      ];
      const result = formatMatchesAsText(matches);
      expect(result).toBe("src/a.js:1\nconst a\n\nsrc/b.js:2\nconst b");
    });
  });

  describe("getSupportedLanguages", () => {
    test("returns sorted list of languages", () => {
      const languages = getSupportedLanguages();
      expect(languages).toBeInstanceOf(Array);
      expect(languages.length).toBeGreaterThan(0);
      expect(languages).toEqual([...languages].sort());
      expect(languages).toContain("javascript");
      expect(languages).toContain("python");
      expect(languages).toContain("typescript");
    });
  });
});
