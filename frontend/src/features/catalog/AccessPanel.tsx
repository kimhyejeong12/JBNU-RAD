import type { FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateAccess, useUpdateAccess } from "./api";
import { useRequests } from "@/app/data";
import { PanelHead } from "@/app/ui/PanelHead";
import { PanelFoot, PanelMsg } from "@/app/ui/PanelMsg";
import { catalogQuery } from "@/shared/api/queries";
import type { AccessItem } from "@/shared/api/types";
import { stamp } from "@/shared/lib/format";
import { isActive } from "@/shared/lib/request";

const Fields = ({ v }: { v?: AccessItem }) => (
  <>
    <label>이름<input name="name" required maxLength={100} defaultValue={v?.name ?? ""} placeholder="예: 급여 테이블 조회" /></label>
    <label>시스템<input name="system" maxLength={100} defaultValue={v?.system ?? ""} placeholder="예: 인사 시스템" /></label>
    <label>분류<input name="category" maxLength={100} defaultValue={v?.category ?? ""} placeholder="예: 급여정보 · 인사정보 · 관리자" /></label>
    <label className="wide">설명 (AI 판정에도 함께 넘깁니다)<textarea name="description" rows={2} maxLength={2000} defaultValue={v?.description ?? ""} placeholder="무엇을 할 수 있는 권한인지" /></label>
  </>
);

// 권한 목록 패널 (보안 총책임자) — 선택 없음 = 권한 등록. 지난 신청이 코드를 가리키므로 코드는 못 바꾸고, 지우지 않고 끕니다.
export function AccessPanel({ a }: { a: AccessItem | null }) {
  return a ? <EditAccess a={a} /> : <NewAccess />;
}

function NewAccess() {
  const create = useCreateAccess();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    create.mutate(Object.fromEntries(new FormData(e.currentTarget)));
  }
  return (
    <>
      <PanelHead title="권한 등록" />
      <form className="panel-body form-grid" id="access-form" style={{ padding: "16px 18px" }} onSubmit={onSubmit}>
        <label>코드 (바꿀 수 없음)<input name="code" required maxLength={64} pattern="[A-Za-z0-9_.\-]+" autoComplete="off" placeholder="예: HR_SALARY_READ" /></label>
        <Fields />
        <div className="wide form-actions"><PanelMsg /><button type="submit" className="primary">등록</button></div>
      </form>
    </>
  );
}

function EditAccess({ a }: { a: AccessItem }) {
  const update = useUpdateAccess();
  const requests = useRequests();
  // 저장 뒤 서버 값으로 다시 그립니다 (폼은 uncontrolled).
  const formKey = `${a.code}:${useQuery(catalogQuery()).dataUpdatedAt}`;
  const used = requests.filter((r) => r.access_code === a.code);
  const active = used.filter((r) => isActive(r)).length;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    update.mutate({ code: a.code, patch: { name: f.get("name"), system: f.get("system"), category: f.get("category"), description: f.get("description"), is_active: f.get("is_active") === "on" } });
  }

  return (
    <>
      <PanelHead title="권한" />
      <div className="panel-body">
        <p className="subject">{a.name} ({a.code})</p>
        <div className="meta">{a.is_active ? "켜짐 — 일반 사용자가 신청할 수 있습니다" : "꺼짐 — 새로 신청할 수 없습니다"} · 신청 {used.length}건 · 유효 {active}건 · 등록 {stamp(a.created_at)}</div>
        <form key={formKey} className="form-grid" id="access-edit" style={{ padding: "12px 0 0" }} onSubmit={onSubmit}>
          <Fields v={a} />
          <label className="check wide"><input type="checkbox" name="is_active" defaultChecked={a.is_active} />켜짐 (끄면 새 신청만 막고, 이미 받은 권한 · 결재 중인 신청은 그대로)</label>
          <div className="wide form-actions"><button type="submit" className="primary">저장</button></div>
        </form>
      </div>
      <PanelFoot note="이름을 바꿔도 이미 낸 신청에는 신청 때 이름이 남습니다." />
    </>
  );
}
