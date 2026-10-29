/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { cn } from "./cn";

// Tailwind 는 소스의 글자에서 클래스를 찾으므로 `bg-${tone}` 처럼 조각으로 만든 이름은 CSS 가 생기지 않습니다.
// 유틸리티 앞부분에 이어 붙이는 꼴(`bg-${x}`)과, className 줄에서 변형을 변수로 붙이는 꼴(`${variant}:x`)을 막습니다.
const FRAGMENT = /\b(?:bg|text|border|shadow|fill|stroke|ring|outline|from|to)-\$\{/;
const VARIANT = /\$\{[\w.]+\}:[a-z[]/;

function fragmentClasses(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...fragmentClasses(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      readFileSync(path, "utf8").split("\n").forEach((line, i) => {
        const cls = line.search(/className|\bcn\(/);   // 클래스 값이 시작하는 곳부터만 봅니다 (같은 줄의 키 문자열 `${key}:x` 는 빼고)
        if (FRAGMENT.test(line) || (cls >= 0 && VARIANT.test(line.slice(cls)))) found.push(`${path}:${i + 1}`);
      });
    }
  }
  return found;
}

test("cn: 뒤 클래스가 같은 속성을 이김", () => expect(cn("p-2 text-ink", "p-4")).toBe("text-ink p-4"));

test("cn: 거짓 값은 빠짐", () => {
  const off: boolean = false;
  expect(cn("a", off && "b", undefined, "c")).toBe("a c");
});

test("cn: 색 토큰과 글자 크기는 서로 지우지 않음", () =>
  expect(cn("text-ink-dim", "text-[12.5px]")).toBe("text-ink-dim text-[12.5px]"));

test("클래스 이름을 조각으로 만들지 않음 — Tailwind 가 소스에서 못 찾음", () =>
  expect(fragmentClasses("src")).toEqual([]));
