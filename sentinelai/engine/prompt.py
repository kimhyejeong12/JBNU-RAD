from __future__ import annotations

from langchain_core.prompts import ChatPromptTemplate


class Prompts:
    """보안 검토용 프롬프트 모음."""

    SYSTEM = (
        "당신은 기업 보안 정책과 접근 권한을 검토하는 보안 분석가입니다.\n"
        "1. 제공된 근거 문서에 있는 내용만 사용하고, 없는 내용은 추측하지 마십시오.\n"
        "2. 근거가 부족하면 부족하다고 명시하십시오.\n"
        "3. 모든 판단에는 근거 문서의 출처를 함께 제시하십시오.\n"
        "4. 답변은 한국어로, 실무자가 바로 읽을 수 있게 간결하게 작성하십시오."
    )

    ANSWER = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM),
            (
                "human",
                "다음은 사내 보안 기준 문서에서 검색된 근거입니다.\n"
                "--- 근거 시작 ---\n{context}\n--- 근거 끝 ---\n\n"
                "질문: {question}",
            ),
        ]
    )

    ACCESS_REVIEW = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM),
            (
                "human",
                "[신청자]\n{requester}\n\n"
                "[신청 권한]\n{requested_access}\n\n"
                "[현재 보유 권한]\n{current_access}\n\n"
                "[적용 기준 문서]\n{context}\n\n"
                "위 신청의 업무 연관성과 적정성을 판단하고, 정상 / 주의 / 위험 중 하나로 "
                "등급을 매기십시오.",
            ),
        ]
    )

    EVENT_REVIEW = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM),
            (
                "human",
                "[대상 사용자]\n{subject}\n\n"
                "[보안 솔루션 로그]\n{events}\n\n"
                "[적용 기준 문서]\n{context}\n\n"
                "[관련 솔루션 정책]\n{rules}\n\n"
                "위 사용자의 행위를 기준 문서와 솔루션 정책에 비추어 판단하고, 어긋나는 조항이나 "
                "정책이 있으면 밝히십시오. 정상 / 주의 / 위험 중 하나로 등급을 매기십시오. "
                "기준 문서와 솔루션 정책 어디에도 이 행위를 직접 다루는 내용이 없으면 "
                "그 사실을 판단 이유에 밝히십시오.",
            ),
        ]
    )

    LOG_FILTER = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM),
            (
                "human",
                "[로그에 있는 값]\n{vocabulary}\n\n"
                "[현재 시각 (UTC)]\n{now}\n\n"
                "[질문]\n{question}\n\n"
                "질문에 답하려면 어떤 보안 솔루션 로그를 골라야 하는지 조건만 뽑으십시오. "
                "질문에 없는 조건은 빈 문자열로 두십시오. 값은 [로그에 있는 값]의 표기를 따르고, "
                "'이번 주' · '어제' 같은 기간은 현재 시각을 기준으로 ISO 8601 UTC 시각으로 바꾸십시오. "
                "질문이 묻는 행위나 값이 [로그에 있는 값]에 없으면 비슷한 값으로 바꾸지 말고 질문의 표현을 그대로 적으십시오.",
            ),
        ]
    )

    LOG_ANSWER = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM),
            (
                "human",
                "[질문]\n{question}\n\n"
                "[적용한 조건]\n{criteria}\n\n"
                "[집계]\n{facts}\n\n"
                "[해당 로그]\n{lines}\n\n"
                "집계와 해당 로그만 근거로 질문에 답하십시오. 건수 · 합계는 [집계]의 숫자를 그대로 쓰고 "
                "로그를 직접 세지 마십시오. 해당 로그가 없으면 없다고 답하십시오. 정책 위반 여부는 판단하지 마십시오. "
                "마크다운(굵게 · 표 · 목록 기호) 없이 평문 두세 문장으로 답하십시오.",
            ),
        ]
    )

    POLICY_CONFLICT = ChatPromptTemplate.from_messages(
        [
            ("system", SYSTEM),
            (
                "human",
                "다음은 여러 보안 솔루션에서 수집해 공통 형식으로 표준화한 정책 목록입니다.\n"
                "--- 정책 시작 ---\n{policies}\n--- 정책 끝 ---\n\n"
                "[적용 기준 문서]\n{context}\n\n"
                "기준 문서에 비추어 정책 간 중복, 상호 충돌, 과도한 허용을 찾아내고 각 항목마다 "
                "관련 정책 ID와 위험 사유, 근거 조항, 개선안을 제시하십시오.",
            ),
        ]
    )
