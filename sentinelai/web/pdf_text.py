"""PDF 에서 글자만 꺼냅니다 — 기준 문서는 글로 올리므로 사람이 꺼낸 글을 보고 고친 뒤 올립니다. 스캔본(이미지)은 OCR 이 없어 못 읽습니다."""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field

from pypdf import PdfReader
from pypdf.errors import PdfReadError

MAX_BYTES = 20_000_000
MAX_PAGES = 500


class PdfProblem(ValueError):
    """화면에 그대로 보여 줄 문장입니다."""


@dataclass
class PdfText:
    text: str
    pages: int
    empty_pages: list[int] = field(default_factory=list)   # 1부터, 글자가 없는 쪽 (스캔 쪽일 수 있음)


def _clean(page: str) -> str:
    page = page.replace("\x00", "").replace("\r\n", "\n").replace("\r", "\n")
    lines = [line.rstrip() for line in page.split("\n")]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()


def extract(data: bytes, max_chars: int) -> PdfText:
    if len(data) > MAX_BYTES:
        raise PdfProblem(f"PDF 는 {MAX_BYTES // 1_000_000}MB 까지 읽습니다")
    if not data.startswith(b"%PDF"):
        raise PdfProblem("PDF 파일이 아닙니다")
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted and not reader.decrypt(""):
            raise PdfProblem("암호가 걸린 PDF 입니다. 암호를 푼 파일로 업로드하세요")
        if len(reader.pages) > MAX_PAGES:
            raise PdfProblem(f"{MAX_PAGES}쪽 까지 읽습니다")
        texts = [_clean(p.extract_text() or "") for p in reader.pages]
    except PdfProblem:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError, OSError) as e:
        raise PdfProblem("PDF 를 읽지 못했습니다. 파일이 깨졌는지 확인하세요") from e
    empty = [i for i, t in enumerate(texts, 1) if not t]
    if len(empty) == len(texts):
        raise PdfProblem("글자가 없는 PDF 입니다. 스캔본은 OCR 이 필요합니다")
    text = "\n\n".join(t for t in texts if t)
    if len(text) > max_chars:
        raise PdfProblem(f"꺼낸 글이 {max_chars:,}자를 넘습니다. 나눠서 업로드하세요")
    return PdfText(text=text, pages=len(texts), empty_pages=empty)
