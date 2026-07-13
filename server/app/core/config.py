"""应用配置：基于 Pydantic Settings 读取环境变量。"""
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    # ===== MySQL =====
    MYSQL_HOST: str = "localhost"
    MYSQL_PORT: int = 3306
    MYSQL_USER: str = "blogshare"
    MYSQL_PASSWORD: str = "changeme_strong_password"
    MYSQL_DATABASE: str = "blogshare"

    # ===== Redis =====
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = 0
    REDIS_URL: str = ""

    # ===== Server =====
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 8000
    DEBUG: bool = False
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:80"

    # ===== JWT =====
    JWT_SECRET_KEY: str = "please_change_this_to_a_random_long_string_at_least_32_chars"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ===== Upload =====
    UPLOAD_DIR: str = "uploads"
    UPLOAD_MAX_SIZE: int = 10 * 1024 * 1024  # 10MB
    UPLOAD_ALLOWED_EXTENSIONS: str = "jpg,jpeg,png,gif,webp,svg,bmp"

    # ===== 文件存储后端 =====
    STORAGE_BACKEND: str = "local"  # local / oss
    # 阿里云 OSS
    OSS_ACCESS_KEY_ID: str = ""
    OSS_ACCESS_KEY_SECRET: str = ""
    OSS_ENDPOINT: str = ""  # e.g. oss-cn-hangzhou.aliyuncs.com
    OSS_BUCKET_NAME: str = ""
    OSS_CDN_DOMAIN: str = ""  # 绑定的 CDN/自定义域名，如 https://cdn.blogshare.com（留空则用 bucket 默认域名）

    # ===== RabbitMQ =====
    RABBITMQ_HOST: str = "localhost"
    RABBITMQ_PORT: int = 5672
    RABBITMQ_USER: str = "guest"
    RABBITMQ_PASSWORD: str = "guest"
    RABBITMQ_VHOST: str = "/"
    RABBITMQ_URL: str = ""
    NOTIFICATION_QUEUE: str = "notifications"

    @property
    def rabbitmq_url(self) -> str:
        if self.RABBITMQ_URL:
            return self.RABBITMQ_URL
        return (
            f"amqp://{self.RABBITMQ_USER}:{self.RABBITMQ_PASSWORD}"
            f"@{self.RABBITMQ_HOST}:{self.RABBITMQ_PORT}/{self.RABBITMQ_VHOST}"
        )

    # ===== SMS 短信 =====
    SMS_PROVIDER: str = "mock"  # mock / aliyun / tencent
    SMS_SIGN_NAME: str = "BlogShare"
    SMS_TEMPLATE_CODE: str = ""
    SMS_ACCESS_KEY_ID: str = ""
    SMS_ACCESS_KEY_SECRET: str = ""

    @property
    def database_url(self) -> str:
        return (
            f"mysql+aiomysql://{self.MYSQL_USER}:{self.MYSQL_PASSWORD}"
            f"@{self.MYSQL_HOST}:{self.MYSQL_PORT}/{self.MYSQL_DATABASE}?charset=utf8mb4"
        )

    @property
    def database_url_sync_safe(self) -> str:
        """供 Alembic 使用（env.py 用 async_engine_from_config 处理）。"""
        return self.database_url

    @property
    def redis_url(self) -> str:
        if self.REDIS_URL:
            return self.REDIS_URL
        if self.REDIS_PASSWORD:
            return (
                f"redis://:{self.REDIS_PASSWORD}@{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
            )
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


settings = Settings()
