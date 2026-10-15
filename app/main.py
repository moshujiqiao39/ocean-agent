"""网页问答服务。知识文件一旦变化，下一次提问会自动重新读取。"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from app.agent import Agent, load_env
from app.knowledge import Library

ROOT = Path(__file__).resolve().parents[1]
STATIC = Path(__file__).resolve().parent / "static"

load_env(ROOT / ".env")
library = Library(ROOT / "knowledge")
agent = Agent(library)

app = FastAPI(title="海洋智能体")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


class SourceOut(BaseModel):
    title: str
    heading: str
    file: str


class ChatOut(BaseModel):
    answer: str
    sources: list[SourceOut]
    refused: bool
    mode: str


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC / "index.html")


@app.get("/api/status")
def status() -> dict:
    library.ensure()
    return {
        "documents": library.docs,
        "chunks": len(library.chunks),
        "mode": "llm" if agent.llm_enabled() else "retrieval",
    }


@app.post("/api/reload")
def reload_knowledge() -> dict:
    library.reload()
    return {"documents": len(library.docs), "chunks": len(library.chunks)}


@app.post("/api/chat", response_model=ChatOut)
def chat(body: ChatIn) -> ChatOut:
    result = agent.ask(body.message)
    return ChatOut(
        answer=result.answer,
        sources=[SourceOut(**item) for item in result.sources],
        refused=result.refused,
        mode=result.mode,
    )
