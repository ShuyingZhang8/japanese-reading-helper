import hashlib
import os
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from typing import AsyncIterator

from cachetools import LRUCache
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from ai.fallback import JMdictFallbackProvider
from ai.gemini import GeminiProvider
from ai.openai_provider import OpenAIProvider
from ai.router import AIRouter
from db import close_pool, init_pool, get_pool
from jlpt_filter import get_unknown_vocab_items, init_jlpt_data_from_db, mark_unknown_tokens
from jmdict_client import init_jmdict_data_from_db
from quiz_generator import generate_quiz
from schemas import (
    AnalyzeRequest,
    AnalyzeResponse,
    HealthResponse,
    QuizRequest,
    QuizResponse,
    SentenceExplanationRequest,
    SentenceExplanationResponse,
    TokenizeRequest,
    TokenizeResponse,
)
from tokenizer import tokenize_article

load_dotenv()

# ── LRU cache (sentence → explanation) ─────────────────────────────────────
_sentence_cache: LRUCache = LRUCache(maxsize=500)
_cache_lock = threading.Lock()

# ── Sliding-window rate limiters ────────────────────────────────────────────
_GLOBAL_RPM_LIMIT = 14
_PER_IP_RPM_LIMIT = 20
_rate_lock = threading.Lock()
_global_window: deque[float] = deque()
_per_ip_windows: dict[str, deque[float]] = {}


def _allow_ai_request(client_ip: str) -> bool:
    now = time.monotonic()
    cutoff = now - 60.0
    with _rate_lock:
        while _global_window and _global_window[0] < cutoff:
            _global_window.popleft()
        if len(_global_window) >= _GLOBAL_RPM_LIMIT:
            return False
        ip_win = _per_ip_windows.setdefault(client_ip, deque())
        while ip_win and ip_win[0] < cutoff:
            ip_win.popleft()
        if len(ip_win) >= _PER_IP_RPM_LIMIT:
            return False
        _global_window.append(now)
        ip_win.append(now)
        return True


# ── AI providers ────────────────────────────────────────────────────────────
_fallback_provider: JMdictFallbackProvider | None = None
_ai_router: AIRouter | None = None


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    global _fallback_provider, _ai_router

    await init_pool()
    pool = get_pool()
    await init_jlpt_data_from_db(pool)
    await init_jmdict_data_from_db(pool)

    _fallback_provider = JMdictFallbackProvider()
    ai_provider_name = os.getenv("AI_PROVIDER", "gemini").lower()
    primary = OpenAIProvider() if ai_provider_name == "openai" else GeminiProvider()
    _ai_router = AIRouter(primary=primary, fallback=_fallback_provider)
    yield
    await close_pool()


app = FastAPI(title="Japanese Reading Companion API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok", service="japanese-reading-companion")


@app.post("/api/analyze", response_model=AnalyzeResponse)
def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    tokens = tokenize_article(req.article)
    marked = mark_unknown_tokens(tokens, req.jlpt_level)
    unknown_vocab = get_unknown_vocab_items(marked)
    return AnalyzeResponse(
        tokens=marked,
        unknown_vocab=unknown_vocab,
        article_raw=req.article,
        token_count=len(marked),
        unknown_count=len(unknown_vocab),
    )


@app.post("/api/tokenize", response_model=TokenizeResponse)
def tokenize(req: TokenizeRequest) -> TokenizeResponse:
    tokens = tokenize_article(req.text)
    marked = mark_unknown_tokens(tokens, req.jlpt_level)
    return TokenizeResponse(
        success=True,
        tokens=marked,
        token_count=len(marked),
        original_text=req.text,
    )


@app.post("/api/explain-sentence", response_model=SentenceExplanationResponse)
def explain_sentence(req: SentenceExplanationRequest, request: Request) -> SentenceExplanationResponse:
    cache_key = hashlib.sha256(f"{req.sentence}|{req.jlpt_level}".encode()).hexdigest()
    with _cache_lock:
        cached = _sentence_cache.get(cache_key)
    if cached is not None:
        return cached

    client_ip = request.client.host if request.client else "unknown"
    if req.force_fallback or not _allow_ai_request(client_ip):
        result = _fallback_provider.explain_sentence(req.sentence, req.jlpt_level, req.dict_forms)  # type: ignore[union-attr]
    else:
        result = _ai_router.explain_sentence(req.sentence, req.jlpt_level, req.dict_forms)  # type: ignore[union-attr]

    with _cache_lock:
        _sentence_cache[cache_key] = result
    return result


@app.post("/api/generate-quiz", response_model=QuizResponse)
def generate_quiz_endpoint(req: QuizRequest) -> QuizResponse:
    try:
        return generate_quiz(req.article, req.jlpt_level, req.unknown_words)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


