"""全局异常处理中间件与处理器。

骨架阶段提供基础 JSON 异常响应；后续阶段补充业务异常类。
"""
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppException(Exception):
    """业务异常基类。"""

    def __init__(self, message: str, status_code: int = 400, code: str = "APP_ERROR"):
        self.message = message
        self.status_code = status_code
        self.code = code


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def app_exception_handler(request: Request, exc: AppException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"code": exc.code, "message": exc.message},
        )
