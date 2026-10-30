import { useState } from "react";
import { useMine } from "@/app/session/data";
import { useMe } from "@/app/session/me";
import { myNotices, seenStamp, unreadCount, type Notice } from "./lib";

// 일반 사용자의 결재 알림 — 서버에 읽음 기록이 없어 종을 마지막으로 연 시각을 이 브라우저에만 남깁니다.
// 다른 역할은 내 신청을 받지 않으므로 알림이 비어 있습니다.
export function useMyNotices(): { notices: Notice[]; unread: number; markSeen: () => void } {
  const me = useMe();
  const notices = myNotices(useMine());
  const key = `sentinelai.notice-seen.${me.login_id}`;
  const [seenAt, setSeenAt] = useState<string | null>(() => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  });
  const markSeen = () => {
    const at = seenStamp(notices);
    try {
      localStorage.setItem(key, at);
    } catch {
      // 저장하지 못해도 이번 화면에서는 읽은 것으로 둡니다.
    }
    setSeenAt(at);
  };
  return { notices, unread: unreadCount(notices, seenAt), markSeen };
}
