import { createContext, useContext } from "react";
import type { Me } from "@/shared/api/types";

export const MeContext = createContext<Me | null>(null);

// 로그인한 사람 — 껍데기 안에서는 늘 있습니다.
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("MeContext 밖에서 useMe 를 불렀습니다");
  return me;
}
