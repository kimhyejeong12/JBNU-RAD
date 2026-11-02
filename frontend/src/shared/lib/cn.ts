import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// 조건부 클래스를 잇고, 같은 속성을 두 번 주면 뒤의 것만 남깁니다 (쓰는 곳에서 공통 모양을 덮어쓸 때).
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
