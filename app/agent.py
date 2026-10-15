"""根据检索到的海洋资料作答。配置了语言模型时，用它组织口语回答。"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import httpx

from app.knowledge import Hit, Library, visible_text

REFUSAL = "知识库里没有足够依据回答这个问题。可以换一个和海洋有关的问法，或者先在 knowledge 目录里补充资料。"


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


@dataclass
class Answer:
    answer: str
    sources: list[dict[str, str]]
    refused: bool
    mode: str
    top_score: float


class Agent:
    def __init__(self, library: Library) -> None:
        self.library = library

    def llm_enabled(self) -> bool:
        return bool(os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY"))

    def ask(self, message: str, use_llm: bool | None = None) -> Answer:
        message = message.strip()
        found = self.library.search(message)
        if not found.hits:
            return Answer(REFUSAL, [], True, "retrieval", found.top_score)
        sources = [
            {
                "title": hit.chunk.doc_title,
                "heading": hit.chunk.heading,
                "file": hit.chunk.file,
            }
            for hit in found.hits
        ]
        enabled = self.llm_enabled() if use_llm is None else use_llm
        if enabled:
            try:
                text = self._complete(message, found.hits)
                return Answer(text, sources, False, "llm", found.top_score)
            except httpx.HTTPError:
                pass
        return Answer(_extract(found.hits), sources, False, "retrieval", found.top_score)

    def _complete(self, message: str, hits: list[Hit]) -> str:
        key = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY", "")
        base = os.environ.get("LLM_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        model = os.environ.get("LLM_MODEL", "gpt-4o-mini")
        material = "\n\n".join(
            f"《{hit.chunk.doc_title}》{hit.chunk.heading}\n{visible_text(hit.chunk, limit=800)}"
            for hit in hits
        )
        payload = {
            "model": model,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是海洋知识智能体。只根据给定资料回答。"
                        "用日常中文，先给一句结论，再简短解释。"
                        "资料没有的事实要直接说知识库里没有足够依据，不要用常识补上。"
                        "不要编造数字、年份和地名。不要使用 Markdown 标记。"
                        "最后用一句话注明依据来自哪一篇资料。"
                    ),
                },
                {
                    "role": "user",
                    "content": f"资料：\n{material}\n\n问题：{message}",
                },
            ],
        }
        response = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {key}"},
            json=payload,
            timeout=45,
        )
        response.raise_for_status()
        data = response.json()
        text = data["choices"][0]["message"]["content"]
        if not isinstance(text, str) or not text.strip():
            raise httpx.HTTPError("empty completion")
        return text.strip()


def _extract(hits: list[Hit]) -> str:
    parts = ["根据已掌握的海洋资料："]
    parts.extend(visible_text(hit.chunk) for hit in hits)
    return "\n\n".join(parts)
