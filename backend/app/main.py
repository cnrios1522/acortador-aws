"""API para crear, consultar y redirigir enlaces cortos."""
from datetime import datetime, timezone
import logging
from uuid import uuid4

from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, HttpUrl

from .config import BASE_URL, CORS_ORIGINS
from .dynamo import find_url, save_url

logger = logging.getLogger(__name__)
app = FastAPI(title="Acortador de enlaces AWS", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


class ShortenRequest(BaseModel):
    original_url: HttpUrl


def load_or_404(short_code: str) -> dict:
    try:
        record = find_url(short_code)
    except (ClientError, BotoCoreError):
        logger.exception("Error consultando DynamoDB")
        raise HTTPException(status_code=503, detail="Base de datos no disponible")
    if record is None:
        raise HTTPException(status_code=404, detail="Enlace no encontrado")
    return record


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/shorten", status_code=201)
def shorten(payload: ShortenRequest):
    code = str(uuid4())
    record = {
        "short_code": code,
        "original_url": str(payload.original_url),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        save_url(record)
    except (ClientError, BotoCoreError):
        logger.exception("Error guardando en DynamoDB")
        raise HTTPException(status_code=503, detail="No se pudo guardar el enlace")
    return {**record, "short_url": f"{BASE_URL}/{code}"}


@app.get("/urls/{short_code}")
def get_url_info(short_code: str):
    return load_or_404(short_code)


@app.get("/{short_code}")
def redirect(short_code: str):
    record = load_or_404(short_code)
    return RedirectResponse(url=record["original_url"], status_code=307)
