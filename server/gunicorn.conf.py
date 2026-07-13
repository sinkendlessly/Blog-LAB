"""Gunicorn 配置文件（非 Docker 部署使用）。

Docker 部署直接使用 Dockerfile 中的 CMD 参数。
本地开发或手动部署时使用此文件：

    gunicorn -c gunicorn.conf.py app.main:app

"""
import os

# 绑定地址
bind = os.getenv("GUNICORN_BIND", "0.0.0.0:8000")

# Worker 进程数：建议 2-4 个 CPU 核心
# 注意每个 worker 独立占用 DB 连接池，4 workers × 30 = 120 连接
workers = int(os.getenv("GUNICORN_WORKERS", "4"))

# 使用 Uvicorn 异步 worker（兼容 FastAPI）
worker_class = "uvicorn.workers.UvicornWorker"

# 每个 worker 的最大并发连接数（对 uvicorn worker 自动处理，无需设置）
# 超时
timeout = int(os.getenv("GUNICORN_TIMEOUT", "60"))
graceful_timeout = 30

# 日志
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("GUNICORN_LOG_LEVEL", "info")

# 重启
max_requests = int(os.getenv("GUNICORN_MAX_REQUESTS", "10000"))
max_requests_jitter = 1000

# 预加载应用（共享内存，减少 fork 后的内存使用）
preload_app = True
