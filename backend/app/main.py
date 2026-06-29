import logging
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from fastapi.responses import JSONResponse

from backend.app.routers.games import router as games_router
from backend.app.routers.steam import router as steam_router
from backend.app.exceptions import UnknownVibeException
from backend.app.config import config

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class LoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request.state.logger = logger
        response = await call_next(request)
        return response

app.add_middleware(LoggingMiddleware)

app.include_router(games_router)
app.include_router(steam_router)

@app.get("/api/health")
def health():
    """Health check endpoint"""
    logger.info("Health check accessed")
    return {"status": "ok"}

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger = request.state.logger  
    logger.error(f"Unexpected error: {str(exc)}", exc_info=True)
    
    return {
        "message": "Internal server error", 
        "status": 500
    }

@app.exception_handler(UnknownVibeException)
async def unknown_vibe_handler(request: Request, exc: UnknownVibeException):
    return JSONResponse(
            content=f"Uknown vibe, no games was returned. Use {config.VIBES_MAP.keys()}.",
            status_code=404
        )