"""기준 문서 엑셀 — 합친 칸을 채운 표, 두 줄 머리, 사람 기록 표 표시, 깨진 파일을 봅니다."""
from __future__ import annotations

import io

import pytest
from openpyxl import Workbook
from openpyxl.comments import Comment

from sentinelai.web.xlsx_text import XlsxProblem, extract


def _book() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "보안관리"
    ws["B1"] = "■ 통제 정책 현황"
    ws["B2"] = "- 대상 : PC, 네트워크"
    for col, name in zip("BCDE", ["구분", "통제 기능", "정책 적용 현황", "도입비용"]):
        ws[f"{col}4"] = name
    ws["B5"], ws["C5"], ws["D5"] = "매체제어", "이동식 저장 매체 차단", "USB 읽기\n- CD 차단"
    ws["B6"], ws["C6"], ws["D6"] = "E-DLP", "데이터 보호", "WEB/APP\n- 주민번호 1건 이상"
    ws["D7"] = "REMOVABLE STORAGE"
    ws.merge_cells("B6:B7")
    ws.merge_cells("C6:C7")
    ws["D7"].comment = Comment("검토자:\n반출 승인 필요", "검토자")
    ws["B10"] = "3) 예외처리 현황"
    ws["B11"] = "[DLP]"
    for col, name in zip("BCD", ["구분", "사번(아이디)", "예외 정책"]):
        ws[f"{col}12"] = name
    ws["B13"], ws["C13"], ws["D13"] = "로컬", "Q00001", "USB 쓰기 허용"
    # 두 줄 머리 · 데이터 없음 — 빠짐
    ws["B16"] = "사용자 정보"
    ws.merge_cells("B16:C16")
    ws["B17"], ws["C17"] = "사번", "IP"
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def test_tables_with_merged_cells_titles_and_notes():
    policy, exceptions = extract(_book(), 1_000_000)
    assert (policy.sheet, policy.title, policy.intro) == ("보안관리", "■ 통제 정책 현황", ["- 대상 : PC, 네트워크"])
    assert policy.columns == ["구분", "통제 기능", "정책 적용 현황"]   # 빈 도입비용 칸은 뺌
    assert [r.cells for r in policy.rows] == [
        ["매체제어", "이동식 저장 매체 차단", "USB 읽기\n- CD 차단"],
        ["E-DLP", "데이터 보호", "WEB/APP\n- 주민번호 1건 이상"],
        ["E-DLP", "데이터 보호", "REMOVABLE STORAGE"],
    ]
    assert policy.rows[2].notes == ["정책 적용 현황: 반출 승인 필요"]
    assert not policy.personal
    assert exceptions.title == "3) 예외처리 현황 [DLP]"
    assert exceptions.personal


def test_not_xlsx():
    with pytest.raises(XlsxProblem, match="읽지 못했습니다"):
        extract(b"%PDF-1.4 not a workbook", 1_000_000)


def test_empty_book():
    out = io.BytesIO()
    Workbook().save(out)
    with pytest.raises(XlsxProblem, match="표가 없습니다"):
        extract(out.getvalue(), 1_000_000)


def test_too_long():
    with pytest.raises(XlsxProblem, match="자를 넘습니다"):
        extract(_book(), 20)
