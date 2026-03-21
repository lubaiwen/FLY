from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn

from api import router
from config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting Drone Scheduling Engine...")
    print(f"Configuration loaded:")
    print(f"  - City: {settings.city.name}")
    print(f"  - Dispatch Interval: {settings.scheduler.dispatch_interval}s")
    print(f"  - Max Drones: {settings.scheduler.max_drones}")
    print(f"  - Max Nests: {settings.scheduler.max_nests}")
    
    yield
    
    print("Shutting down Drone Scheduling Engine...")


app = FastAPI(
    title="无人机共享基槽匹配算法系统",
    description="基于GAT+KM算法的智能调度系统API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")


@app.get("/")
async def root():
    return {
        "message": "无人机共享基槽匹配算法系统 API",
        "version": "1.0.0",
        "docs": "/docs",
        "redoc": "/redoc",
    }


@app.get("/health")
async def health_check():
    return {"status": "healthy"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
