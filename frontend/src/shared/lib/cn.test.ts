/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { cn } from "./cn";

// Tailwind 는 소스의 글자에서 클래스를 찾으므로 `bg-${tone}` 처럼 조각으로 만든 이름은 CSS 가 생기지 않습니다.
const FRAGMENT = /\b(?:bg|text|border|shadow|fill|stroke|ring|outline|from|to)-\$\{/;

function fragmentClasses(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...fragmentClasses(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      readFileSync(path, "utf8").split("\n").forEach((line, i) => {
        if (FRAGMENT.test(line)) found.push(`${path}:${i + 1}`);
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
