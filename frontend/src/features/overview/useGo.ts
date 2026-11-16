import { targetOf } from "./lib";
import { useQueue } from "@/app/queue/useQueue";
import { useUi } from "@/app/ui/state/UiContext";
import type { OverviewArea } from "@/shared/api/types";

// 항목을 고르면 그 판정을 보는 화면으로 갑니다. 목록에 없는 지난 판정은 메뉴만 엽니다.
export function useGo() {
  const { navigate, select, setMainTab, setStats, openDrawer, gotoActiveGrant } = useUi();
  const items = useQueue();
  return (area: OverviewArea, key: string) => {
    const t = targetOf(area, key);
    if (t.to === "grant") return gotoActiveGrant(t.no);
    if (t.to === "suspect") {
      navigate("stats");
      setMainTab("ustats");
      setStats({ selected: { kind: "suspect", key: t.key } });
      return openDrawer();
    }
    if (t.to === "queue" && items.some((i) => i.key === t.key)) return select(t.key);
    navigate(t.view);
    setMainTab("queue");
  };
}

export type Go = ReturnType<typeof useGo>;
