"""엑셀(.xlsx)에서 표를 꺼냅니다 — 화면이 고른 표만 조항 글로 바꿔 올리므로 여기서는 표 모양만 돌려줍니다."""
from __future__ import annotations

import io
import re
import zipfile
from dataclasses import dataclass, field
from datetime import date, datetime

from openpyxl import load_workbook

MAX_BYTES = 20_000_000
MAX_UNZIPPED = 200_000_000
MAX_CELLS = 2_000_000
# 사람 기록(사번 · 이름)이 든 표는 화면에서 처음부터 빼 둡니다.
PERSONAL = re.compile(r"사번|성명|이름|아이디|대상자명|사원")


class XlsxProblem(ValueError):
    """화면에 그대로 보여 줄 문장입니다."""


@dataclass
class Row:
    cells: list[str]
    notes: list[str] = field(default_factory=list)   # 셀 메모 ("열 이름: 글")


@dataclass
class Table:
    sheet: str
    title: str
    intro: list[str]
    columns: list[str]
    rows: list[Row]
    personal: bool


def _text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat() if value.time() == datetime.min.time() else value.isoformat(sep=" ", timespec="minutes")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    lines = [line.rstrip() for line in str(value).replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "").split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def _note(comment: object) -> str:
    text = _text(getattr(comment, "text", ""))
    author = getattr(comment, "author", "") or ""
    # 엑셀이 메모 앞에 붙이는 "작성자:" 줄을 뺍니다.
    if author and text.startswith(f"{author}:"):
        text = text[len(author) + 1:].strip()
    return text


def _sheet_grid(ws) -> tuple[dict[int, dict[int, str]], set[tuple[int, int]], dict[tuple[int, int], str], dict[tuple[int, int], int]]:
    """칸 글 · 가로로 합쳐져 덮인 칸 · 메모 · 세로로 합친 칸이 시작한 줄을 돌려줍니다."""
    grid: dict[int, dict[int, str]] = {}
    notes: dict[tuple[int, int], str] = {}
    for row in ws.iter_rows():
        for cell in row:
            text = _text(cell.value)
            if text:
                grid.setdefault(cell.row, {})[cell.column] = text
            if cell.comment is not None and (note := _note(cell.comment)):
                notes[(cell.row, cell.column)] = note
    covered: set[tuple[int, int]] = set()
    merged_from: dict[tuple[int, int], int] = {}
    for rng in ws.merged_cells.ranges:
        top = grid.get(rng.min_row, {}).get(rng.min_col, "")
        for r in range(rng.min_row, rng.max_row + 1):
            for c in range(rng.min_col, rng.max_col + 1):
                if c > rng.min_col:
                    covered.add((r, c))
                elif r > rng.min_row and top:
                    grid.setdefault(r, {})[c] = top   # 세로로 합친 칸은 아래 줄에도 같은 값
                    merged_from[(r, c)] = rng.min_row
    return grid, covered, notes, merged_from


def _tables(ws) -> list[Table]:
    grid, covered, notes, merged_from = _sheet_grid(ws)
    cells = lambda r: {c: v for c, v in grid.get(r, {}).items() if (r, c) not in covered}   # noqa: E731
    tables: list[Table] = []
    titles: list[str] = []
    last_title = section = ""
    r, last = 1, max(grid, default=0)
    while r <= last:
        row = cells(r)
        if not row:
            r += 1
            continue
        if len(row) == 1:
            titles.append(next(iter(row.values())))
            r += 1
            continue
        # 표 머리 — 가로로 합친 묶음 머리가 있거나 세로로 합친 머리 칸이 이어지면 다음 줄은 아래 머리입니다.
        head = dict(row)
        r += 1
        if any((r - 1, c) in covered for c in range(1, ws.max_column + 1)) or any(merged_from.get((r, c)) == r - 1 for c in cells(r)):
            for c, v in cells(r).items():
                if merged_from.get((r, c)) != r - 1:
                    head[c] = v   # 묶음 이름보다 아래 머리 이름이 칸을 더 잘 가리킵니다
            r += 1
        body: list[tuple[int, dict[int, str]]] = []
        while (nxt := cells(r)) and not (len(nxt) == 1 and min(nxt) <= min(head) and (r, min(nxt)) not in merged_from):
            body.append((r, nxt))
            r += 1
        heads = [t for t in titles if not t.startswith("-")]
        section = next((t for t in reversed(heads) if not t.startswith("[")), section)
        title = f"{section} {heads[-1]}".strip() if heads and heads[-1].startswith("[") else (heads[-1] if heads else last_title)
        intro = [t for t in titles if t.startswith("-")]
        titles, last_title = [], title or last_title
        cols = [c for c in sorted(head) if any(c in b for _, b in body)]
        rows = [Row([b.get(c, "") for c in cols], [f"{head[c]}: {notes[(br, c)]}" for c in sorted(head) if (br, c) in notes]) for br, b in body]
        if rows:
            columns = [head[c] for c in cols]
            tables.append(Table(ws.title, title or ws.title, intro, columns, rows, bool(PERSONAL.search(" ".join(columns)))))
    return tables


def extract(data: bytes, max_chars: int) -> list[Table]:
    if len(data) > MAX_BYTES:
        raise XlsxProblem(f"엑셀은 {MAX_BYTES // 1_000_000}MB 까지 읽습니다")
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            if sum(i.file_size for i in z.infolist()) > MAX_UNZIPPED:
                raise XlsxProblem("압축을 풀면 너무 큰 엑셀입니다. 필요한 시트만 남겨 올리세요")
        book = load_workbook(io.BytesIO(data), data_only=True)
    except XlsxProblem:
        raise
    except Exception as e:   # 깨진 zip · 다른 형식 · 암호 걸린 파일이 모두 여기로 옵니다
        raise XlsxProblem("엑셀(.xlsx) 파일을 읽지 못했습니다. 암호가 걸렸거나 깨졌는지 확인하세요") from e
    if sum(ws.max_row * ws.max_column for ws in book.worksheets) > MAX_CELLS:
        raise XlsxProblem("칸이 너무 많은 엑셀입니다. 필요한 시트만 남겨 올리세요")
    tables = [t for ws in book.worksheets for t in _tables(ws)]
    if not tables:
        raise XlsxProblem("내용이 든 표가 없습니다")
    chars = sum(len(c) for t in tables for row in t.rows for c in row.cells + row.notes)
    if chars > max_chars:
        raise XlsxProblem(f"표의 글이 {max_chars:,}자를 넘습니다. 필요한 시트만 남겨 올리세요")
    return tables
