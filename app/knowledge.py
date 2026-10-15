"""从 knowledge 目录读取海洋资料，并按日常问法检索。"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

MIN_SCORE = 0.34

TRIGGERS: tuple[tuple[tuple[str, ...], str], ...] = (
    (("水是暖", "比较暖", "比别处暖", "暖和", "热水", "暖流", "黑潮"), "暖流 黑潮 海温 热量"),
    (("涨两次", "涨两回", "涨潮", "退潮", "潮水", "潮汐"), "潮汐 高潮 低潮 引潮力 半日潮"),
    (("变白", "突然白", "白化", "珊瑚"), "珊瑚 白化 虫黄藻"),
    (("鱼特别多", "鱼这么多", "鱼很多", "渔场"), "上升流 营养盐 渔场"),
    (("厄尔尼诺", "拉尼娜", "异常变暖", "赤道太平洋"), "厄尔尼诺 拉尼娜 赤道"),
    (("贝壳", "变酸", "酸化", "碳酸钙"), "海洋酸化 碳酸钙 贝壳"),
    (("鲸鱼", "海豚", "回声", "夜里找", "晚上怎么找"), "鲸鱼 回声定位 齿鲸 须鲸"),
    (("海底", "海面", "温跃", "晒热"), "海水温度 混合层 温跃层"),
    (("台风", "风暴潮", "登陆后"), "台风 风暴潮 热带气旋"),
)


def normalize(text: str) -> str:
    return re.sub(r"[^\w\u4e00-\u9fff]+", "", text.lower())


def ngrams(text: str, size: int) -> list[str]:
    compact = normalize(text)
    if len(compact) < size:
        return [compact] if compact else []
    return [compact[i : i + size] for i in range(len(compact) - size + 1)]


def expand(query: str) -> str:
    extra = [terms for keys, terms in TRIGGERS if any(key in query for key in keys)]
    return "".join(extra)


@dataclass(frozen=True)
class Chunk:
    doc_title: str
    file: str
    heading: str
    text: str


@dataclass(frozen=True)
class Hit:
    chunk: Chunk
    score: float


@dataclass(frozen=True)
class SearchResult:
    hits: list[Hit]
    top_score: float


def _coverage(query: str, text: str, size: int) -> float:
    pieces = ngrams(query, size)
    if not pieces:
        return 0.0
    bag = set(ngrams(text, size))
    return sum(1 for piece in pieces if piece in bag) / len(pieces)


def _title_bonus(query: str, title: str) -> float:
    compact_query = normalize(query)
    compact_title = normalize(title)
    if len(compact_title) >= 2 and compact_title in compact_query:
        return 0.35
    return 0.0


def relevance(query: str, chunk: Chunk) -> float:
    body = f"{chunk.doc_title}\n{chunk.heading}\n{chunk.text}"
    bigram = _coverage(query, body, 2)
    phrase = _coverage(query, body, 4)
    score = 0.45 * bigram + 0.55 * phrase + _title_bonus(query, chunk.doc_title)
    extra = expand(query)
    if extra:
        score += 0.15 * (0.45 * _coverage(extra, body, 2) + 0.55 * _coverage(extra, body, 4))
    return score


class Library:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.docs: list[dict[str, str]] = []
        self.chunks: list[Chunk] = []
        self._stamp: tuple[tuple[str, int], ...] | None = None

    def ensure(self) -> None:
        stamp = self._stamp_of()
        if stamp != self._stamp:
            self._load()
            self._stamp = stamp

    def reload(self) -> None:
        self._stamp = None
        self.ensure()

    def rank(self, query: str) -> list[Hit]:
        self.ensure()
        hits = [Hit(chunk, relevance(query, chunk)) for chunk in self.chunks]
        hits.sort(key=lambda item: item.score, reverse=True)
        return hits

    def search(self, query: str) -> SearchResult:
        ranked = self.rank(query)
        top = ranked[0].score if ranked else 0.0
        if top < MIN_SCORE:
            return SearchResult([], top)
        chosen: list[Hit] = []
        seen: set[str] = set()
        for hit in ranked:
            if hit.score < top * 0.78:
                break
            if hit.chunk.file in seen:
                continue
            seen.add(hit.chunk.file)
            chosen.append(hit)
            if len(chosen) == 2:
                break
        return SearchResult(chosen, top)

    def _stamp_of(self) -> tuple[tuple[str, int], ...]:
        if not self.root.exists():
            return ()
        files = sorted(self.root.glob("*.md"))
        return tuple((path.name, path.stat().st_mtime_ns) for path in files)

    def _load(self) -> None:
        docs: list[dict[str, str]] = []
        chunks: list[Chunk] = []
        if self.root.exists():
            for path in sorted(self.root.glob("*.md")):
                title, file_chunks = _parse(path)
                docs.append({"title": title, "file": path.name})
                chunks.extend(file_chunks)
        self.docs = docs
        self.chunks = chunks


def _parse(path: Path) -> tuple[str, list[Chunk]]:
    raw = path.read_text(encoding="utf-8")
    lines = raw.splitlines()
    title = path.stem
    for line in lines:
        if line.startswith("# "):
            title = line[2:].strip() or title
            break
    sections = re.split(r"(?m)^(?=## )", raw)
    chunks: list[Chunk] = []
    for section in sections:
        body = section.strip()
        if not body or body.startswith("# "):
            continue
        heading = title
        content_lines = body.splitlines()
        if content_lines[0].startswith("## "):
            heading = content_lines[0][3:].strip() or title
        chunks.append(Chunk(title, path.name, heading, body))
    if not chunks:
        chunks.append(Chunk(title, path.name, title, raw.strip()))
    return title, chunks


def visible_text(chunk: Chunk, limit: int = 420) -> str:
    kept: list[str] = []
    for line in chunk.text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("人们会这样问"):
            continue
        kept.append(stripped)
    text = "\n".join(kept).strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "…"
