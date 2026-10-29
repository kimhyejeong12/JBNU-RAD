import { useRegulations } from "@/app/session/data";

// 기준 문서 원문 — 사이드바의 책 아이콘. 배경 · × · Esc 로 닫습니다.
export function DocsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const regulations = useRegulations();
  return (
    <div className={open ? "modal-back show" : "modal-back"} id="docs-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-label="기준 문서 원문">
        <h3>기준 문서 원문 <button id="docs-close" aria-label="닫기" onClick={onClose}>×</button></h3>
        <div id="docs-body">
          {regulations.length
            ? regulations.map((d) => <div className="doc" key={d.name}><h4>{d.name}</h4><pre>{d.content.trim()}</pre></div>)
            : <p className="note">기준 문서를 불러오지 못했습니다.</p>}
        </div>
      </div>
    </div>
  );
}
