import { createContext, useContext } from "react";
import { ROLE_VIEWS, type View } from "./views";
import type { Me } from "@/shared/api/types";

export const MeContext = createContext<Me | null>(null);

export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("MeContext 밖에서 useMe 를 불렀습니다");
  return me;
}

export const useViews = (): View[] => ROLE_VIEWS[useMe().role];
