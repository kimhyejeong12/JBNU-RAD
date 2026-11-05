"""SentinelAI. 하위 패키지를 가져오지 않아 `import sentinelai.data` 가 엔진까지 끌어오지 않습니다."""
from pathlib import Path

__version__ = "0.6.0"

# 어느 디렉터리에서 실행해도 상대 경로가 같은 파일을 가리키게 하는 기준입니다.
ROOT = Path(__file__).resolve().parent.parent
