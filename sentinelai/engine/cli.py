from __future__ import annotations

import argparse
import dataclasses
import sys

from .engine import Engine


class Cli:
    """`python -m sentinelai.engine.cli <command>`"""

    def __init__(self, engine: Engine | None = None) -> None:
        self.engine = engine or Engine()

    def config(self, args: argparse.Namespace) -> int:
        s = self.engine.settings
        for key, value in dataclasses.asdict(s).items():
            print(f"{key:18s} = {value}")
        print(f"{'milvus_mode':18s} = {'서버' if s.milvus_is_server else 'Lite (로컬 파일)'}")
        print(f"{'milvus_target':18s} = {s.milvus_target}")
        return 0

    def models(self, args: argparse.Namespace) -> int:
        for name in self.engine.models():
            print(name)
        return 0

    def health(self, args: argparse.Namespace) -> int:
        s = self.engine.settings
        print(f"서버       : {s.ollama_base_url}")
        try:
            names = self.engine.models()
        except Exception as exc:
            print(f"연결       : 실패 ({exc})", file=sys.stderr)
            return 1
        print(f"연결       : OK (모델 {len(names)}개)")

        chat_ok = self.engine.has_model(s.model, names)
        embed_ok = self.engine.has_model(s.embedding_model, names)
        print(f"기본 모델  : {s.model} {'OK' if chat_ok else '없음'}")
        print(f"임베딩 모델: {s.embedding_model} {'OK' if embed_ok else '없음'}")

        mode = "서버" if s.milvus_is_server else "Lite"
        empty = self.engine.documents.is_empty()
        print(f"Milvus({mode}): {s.milvus_target}")
        print(f"컬렉션     : {s.milvus_collection} "
              f"{'비어 있음 (index 명령으로 적재)' if empty else 'OK'}")
        return 0 if chat_ok and embed_ok else 1

    def index(self, args: argparse.Namespace) -> int:
        report = self.engine.documents.index(args.source, rebuild=args.rebuild)
        print(report)
        for name in report.indexed:
            print(f"  갱신   {name}")
        for name in report.skipped:
            print(f"  건너뜀 {name}")
        return 0

    def search(self, args: argparse.Namespace) -> int:
        for i, doc in enumerate(self.engine.documents.search(args.query, args.k), 1):
            body = doc.page_content.replace("\n", " ")[:160]
            print(f"{i}. [{doc.metadata.get('source', '?')}] {body}")
        return 0

    def ask(self, args: argparse.Namespace) -> int:
        answer = self.engine.rag_chain(structured=True, k=args.k).invoke(args.question)
        print(answer.answer)
        if answer.sources:
            print("\n근거:", ", ".join(answer.sources))
        return 0

    def chat(self, args: argparse.Namespace) -> int:
        llm = self.engine.with_model(args.model) if args.model else self.engine.llm
        if args.no_stream:
            print(llm.invoke(args.prompt).text)
            return 0
        for chunk in llm.stream(args.prompt):
            sys.stdout.write(chunk.text)
            sys.stdout.flush()
        print()
        return 0

    @staticmethod
    def parser() -> argparse.ArgumentParser:
        parser = argparse.ArgumentParser(
            prog="sentinelai.engine.cli",
            description="SentinelAI 엔진 — 로컬 LLM·RAG 코어 (전북대학교 RAD · SK쉴더스)",
        )
        sub = parser.add_subparsers(dest="command", required=True)

        for name, help_text in [
            ("config", "현재 설정 출력"),
            ("health", "서버·모델·컬렉션 상태 확인"),
            ("models", "서버 모델 목록"),
        ]:
            sub.add_parser(name, help=help_text).set_defaults(command=name)

        index = sub.add_parser("index", help="문서를 Milvus 에 적재 (변경된 파일만)")
        index.add_argument("source", help="문서 파일 또는 디렉터리 (.md, .txt)")
        index.add_argument("--rebuild", action="store_true", help="컬렉션을 비우고 전부 새로")
        index.set_defaults(command="index")

        search = sub.add_parser("search", help="저장소 검색만 (답변 생성 없음)")
        search.add_argument("query", help="검색어")
        search.add_argument("-k", type=int, help="가져올 청크 수")
        search.set_defaults(command="search")

        ask = sub.add_parser("ask", help="저장소를 근거로 질의응답 (RAG)")
        ask.add_argument("question", help="질문")
        ask.add_argument("-k", type=int, help="참고할 청크 수")
        ask.set_defaults(command="ask")

        chat = sub.add_parser("chat", help="모델에 직접 질의")
        chat.add_argument("prompt", help="질문")
        chat.add_argument("-m", "--model", help="사용할 모델")
        chat.add_argument("--no-stream", action="store_true", help="스트리밍 없이 출력")
        chat.set_defaults(command="chat")

        return parser

    @classmethod
    def run(cls, argv: list[str] | None = None) -> int:
        args = cls.parser().parse_args(argv)
        try:
            return int(getattr(cls(), args.command)(args))
        except KeyboardInterrupt:
            return 130
        except Exception as exc:
            print(f"오류: {exc}", file=sys.stderr)
            return 1


if __name__ == "__main__":
    raise SystemExit(Cli.run())
