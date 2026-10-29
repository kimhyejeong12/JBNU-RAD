/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { cn } from "./cn";

// Tailwind 는 소스의 글자에서 클래스를 찾으므로 `bg-${tone}` 처럼 조각으로 만든 이름은 CSS 가 생기지 않습니다.
// 1) 유틸리티 앞부분에 값을 이어 붙이는 꼴은 어디서든(상수 포함) 잡습니다 — `h-${n}` · "text-" + x
const PREFIX = "(?:bg|text|border|shadow|fill|stroke|ring|outline|decoration|from|to|h|w|size|min-w|max-w|min-h|max-h|p[xytrbl]?|m[xytrbl]?"
  + "|gap(?:-[xy])?|space-[xy]|rounded(?:-[a-z]+)?|top|left|right|bottom|inset(?:-[xy])?|z|opacity|font|leading|tracking"
  + "|grid-cols|grid-rows|col-span|row-span|col-start|row-start|translate-[xy]|lv|mk)";
const FRAGMENT = new RegExp(`\\b${PREFIX}-(?:\\$\\{|["'\`]\\s*\\+)`);
// 2) className · cn(…) 값 안에서는 앞부분이 무엇이든 — `aspect-${r}`, 변형을 변수로 `${v}:block`, 이어 붙이기 "x-" + y
const IN_CLASS = [/[a-z]-\$\{/g, /\$\{[\w.]+\}:[a-z[]/g, /-["'`]\s*\+/g];
const CLOSE: Record<string, string> = { "{": "}", "(": ")" };

// className="…" · className={…} · cn(…) 의 값을 [시작 위치, 글자] 로 — 여러 줄에 걸친 값도 괄호 짝으로 끝까지 읽습니다.
function classValues(src: string): [number, string][] {
  const out: [number, string][] = [];
  for (const m of src.matchAll(/className=|\bcn\(/g)) {
    let i = m.index + m[0].length;
    if (m[0] === "className=") {
      if (src[i] === '"') { out.push([i, src.slice(i, src.indexOf('"', i + 1) + 1)]); continue; }
      if (src[i] !== "{") continue;
    } else i -= 1;
    const open = src[i];
    let depth = 0, j = i;
    for (; j < src.length; j++) {
      if (src[j] === open) depth++;
      else if (src[j] === CLOSE[open] && --depth === 0) break;
    }
    out.push([i, src.slice(i, j + 1)]);
  }
  return out;
}

// 소스 한 파일에서 조각 클래스가 있는 줄 번호(1부터)를 돌려줍니다.
function fragmentsIn(src: string): number[] {
  const lineAt = (pos: number) => src.slice(0, pos).split("\n").length;
  const found = new Set<number>();
  src.split("\n").forEach((line, i) => { if (FRAGMENT.test(line)) found.add(i + 1); });
  for (const [start, text] of classValues(src)) {
    for (const re of IN_CLASS) for (const m of text.matchAll(re)) found.add(lineAt(start + m.index));
  }
  return [...found].sort((a, b) => a - b);
}

function fragmentFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...fragmentFiles(path));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      for (const n of fragmentsIn(readFileSync(path, "utf8"))) found.push(`${path}:${n}`);
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

describe("조각 클래스 찾기", () => {
  test.each([
    ["색 앞부분", "<i className={`bg-${tone}`} />"],
    ["크기 앞부분", "<i className={`h-${n}`} />"],
    ["cn 안의 크기", '<i className={cn("flex", `size-${s}`)} />'],
    ["상수로 만든 등급 클래스", "const X = `lv-${tone}`;"],
    ["문자열 이어 붙이기", '<i className={"text-" + tone} />'],
    ["변형을 변수로", "<i className={cn(x, `${v}:block`)} />"],
    ["여러 줄 cn 안의 아무 유틸리티", 'const c = cn(\n  "a",\n  `aspect-${r}`,\n);'],
  ])("잡음: %s", (_, src) => expect(fragmentsIn(src)).not.toEqual([]));

  test.each([
    ["className 옆 id 템플릿", "<button className={TOP} id={`tab-${t.tab}`} />"],
    ["상수를 앞에 둔 합치기", "export const statCard = `${card} flex flex-col`;"],
    ["키 문자열", "const k = `${itemKey}#${n}`;"],
    ["툴팁 글자", "<i data-tip={`${k}|로그`} />"],
    ["인라인 스타일 값", '<i style={{ bottom: `${f * 100}%` }} className="x" />'],
  ])("안 잡음: %s", (_, src) => expect(fragmentsIn(src)).toEqual([]));
});

test("클래스 이름을 조각으로 만들지 않음 — Tailwind 가 소스에서 못 찾음", () =>
  expect(fragmentFiles("src")).toEqual([]));
