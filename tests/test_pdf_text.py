"""기준 문서 PDF — 글자만 꺼내고, 글자 없는 쪽 · 암호 · 깨진 파일은 화면에 보일 문장으로 막습니다."""
from __future__ import annotations

import io

import pytest
from pypdf import PdfWriter

from sentinelai.web.pdf_text import PdfProblem, extract


def _pdf(*pages: str | None) -> bytes:
    """None 은 글자 없는 쪽(스캔 쪽 흉내)입니다."""
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    kids = []
    for text in pages:
        stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET" if text else ""
        objs.append(f"<< /Length {len(stream)} >>\nstream\n{stream}\nendstream")
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents {len(objs)} 0 R >>")
        kids.append(f"{len(objs)} 0 R")
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>"
    out, offsets = b"%PDF-1.4\n", []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n".encode()
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return out


def test_pages_joined_and_empty_pages_reported():
    got = extract(_pdf("5.2 ANY rule is forbidden", None, "6.1 DLP over SWG"), 1_000_000)
    assert got.pages == 3
    assert got.empty_pages == [2]
    assert got.text == "5.2 ANY rule is forbidden\n\n6.1 DLP over SWG"


def test_scanned_pdf_needs_ocr():
    with pytest.raises(PdfProblem, match="OCR"):
        extract(_pdf(None, None), 1_000_000)


def test_rejects_not_pdf_broken_and_too_long():
    with pytest.raises(PdfProblem, match="PDF 파일이 아닙니다"):
        extract(b"# markdown", 1_000_000)
    with pytest.raises(PdfProblem, match="읽지 못했습니다"):
        extract(b"%PDF-1.4\ngarbage", 1_000_000)
    with pytest.raises(PdfProblem, match="넘습니다"):
        extract(_pdf("long text here"), 5)


def test_encrypted_pdf():
    writer = PdfWriter(clone_from=io.BytesIO(_pdf("secret")))
    writer.encrypt(user_password="pw", algorithm="RC4-128")
    buf = io.BytesIO()
    writer.write(buf)
    with pytest.raises(PdfProblem, match="암호"):
        extract(buf.getvalue(), 1_000_000)
