"""SentinelAI — 로컬 LLM · RAG 기반 보안 정책 검토 · 로그 감시 시스템.

전북대학교 RAD(RAG & Decision) 팀과 SK쉴더스가 함께 추진하는 산학 프로젝트입니다.

    engine  정책을 RAG 에 쌓고 판정하는 코어 (정책 이해 · 로그 감시 체인)
    data    검토 대상 데이터 계층 (엔진을 가져오지 않음)
    web     대시보드

여기서는 하위 패키지를 가져오지 않습니다. `import sentinelai.data` 가 엔진(langchain)까지 끌어오지 않게 하기 위해서입니다.
"""
from pathlib import Path

__version__ = "0.6.0"

# 상대 경로(.env · docs · data · .milvus)의 기준. 어느 디렉터리에서 실행해도 같은 파일을 가리키게 합니다.
ROOT = Path(__file__).resolve().parent.parent
