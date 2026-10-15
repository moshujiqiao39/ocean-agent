"""用一组口语问题检查检索是否对准资料，答非所问时退出码为 1。"""

from __future__ import annotations

from pathlib import Path

from app.agent import Agent
from app.knowledge import Library

ROOT = Path(__file__).resolve().parents[1]

CASES: tuple[tuple[str, str | None], ...] = (
    ("海里为什么有的地方水是暖的", "黑潮"),
    ("日本旁边的海水为啥比较暖", "黑潮"),
    ("海里有些地方怎么会比别处暖", "黑潮"),
    ("海水为什么一天要涨两次", "潮汐"),
    ("为啥一天会涨两回潮", "潮汐"),
    ("珊瑚怎么突然白了", "珊瑚白化"),
    ("鲸鱼晚上怎么找吃的", "鲸鱼"),
    ("海边怎么鱼这么多", "上升流"),
    ("贝壳是不是更难长了", "海洋酸化"),
    ("赤道太平洋海水异常变暖会怎样", "厄尔尼诺"),
    ("台风登陆后为什么会变弱", "台风"),
    ("海面为什么比海底暖", "海水温度"),
    ("今天午饭吃什么", None),
    ("帮我写一首诗", None),
)


def main() -> int:
    library = Library(ROOT / "knowledge")
    agent = Agent(library)
    failures = 0
    for question, expect in CASES:
        result = agent.ask(question, use_llm=False)
        titles = "、".join(item["title"] for item in result.sources) or "-"
        if expect is None:
            ok = result.refused and not result.sources
        else:
            ok = (not result.refused) and any(expect in item["title"] for item in result.sources)
        if not ok:
            failures += 1
        ranked = library.rank(question)[:3]
        detail = ", ".join(f"{hit.chunk.doc_title}:{hit.score:.2f}" for hit in ranked)
        mark = "OK  " if ok else "FAIL"
        print(f"{mark} {question} -> {titles} [{detail}]")
    print(f"{len(CASES) - failures}/{len(CASES)} passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
