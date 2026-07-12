"""短信验证码服务。

- 开发环境 (mock): 固定验证码 123456，控制台打印
- 生产环境: 调用阿里云/腾讯云短信 API
- Redis 存储验证码 (5分钟过期)
- 频率限制: 60秒内不可重发
"""
import logging
import random

from app.core.config import settings
from app.core.redis import get_redis
from app.utils.redis_keys import RedisKeys
from app.middleware.error_handler import AppException

logger = logging.getLogger(__name__)

# 验证码有效期（秒）
CODE_TTL = 300  # 5 分钟
# 发送间隔（秒）
SEND_INTERVAL = 60  # 1 分钟
# 开发环境固定验证码
MOCK_CODE = "123456"


class SmsService:
    """短信验证码服务。"""

    async def send_code(self, phone: str) -> None:
        """发送短信验证码。"""
        redis = get_redis()

        # 频率限制：60秒内不可重发
        rate_key = RedisKeys.sms_rate_limit(phone)
        remaining = await redis.ttl(rate_key)
        if remaining and remaining > 0:
            raise AppException(
                code="SMS_RATE_LIMIT",
                message=f"发送过于频繁，请 {remaining} 秒后再试",
                status_code=429,
            )

        # 生成验证码
        if settings.SMS_PROVIDER == "mock":
            code = MOCK_CODE
        else:
            code = f"{random.randint(0, 999999):06d}"

        # 存入 Redis
        code_key = RedisKeys.sms_code(phone)
        await redis.setex(code_key, CODE_TTL, code)

        # 设置发送间隔标记
        await redis.setex(rate_key, SEND_INTERVAL, "1")

        # 发送短信
        await self._send_via_provider(phone, code)

    async def verify_code(self, phone: str, code: str) -> None:
        """校验短信验证码，成功后删除。"""
        redis = get_redis()
        code_key = RedisKeys.sms_code(phone)

        stored = await redis.get(code_key)
        if not stored:
            raise AppException(
                code="SMS_CODE_EXPIRED",
                message="验证码已过期，请重新发送",
                status_code=400,
            )

        # redis-py 可能返回 str 或 bytes，统一转 str
        stored_str = stored.decode() if isinstance(stored, bytes) else str(stored)
        if stored_str != code:
            raise AppException(
                code="SMS_CODE_INVALID",
                message="验证码错误",
                status_code=400,
            )

        # 验证成功，删除验证码（一次性使用）
        await redis.delete(code_key)

    async def _send_via_provider(self, phone: str, code: str) -> None:
        """调用短信服务商发送验证码。"""
        provider = settings.SMS_PROVIDER

        if provider == "mock":
            logger.info(
                f"[SMS MOCK] 手机号: {phone}, 验证码: {code}"
            )
            return

        if provider == "aliyun":
            await self._send_aliyun(phone, code)
            return

        if provider == "tencent":
            await self._send_tencent(phone, code)
            return

        # 未知 provider，fallback 到 mock
        logger.warning(f"未知短信服务商: {provider}, fallback 到 mock 模式")
        logger.info(f"[SMS MOCK] 手机号: {phone}, 验证码: {code}")

    async def _send_aliyun(self, phone: str, code: str) -> None:
        """阿里云短信发送（待接入 SDK）。"""
        # TODO: 接入阿里云短信 SDK
        # from alibabacloud_dysmsapi20170525.client import Client
        # from alibabacloud_dysmsapi20170525 import models as sms_models
        logger.info(f"[SMS ALIYUN] 手机号: {phone}, 验证码: {code} (SDK 待接入)")

    async def _send_tencent(self, phone: str, code: str) -> None:
        """腾讯云短信发送（待接入 SDK）。"""
        # TODO: 接入腾讯云短信 SDK
        # from tencentcloud.sms.v20210111 import sms_client, models
        logger.info(f"[SMS TENCENT] 手机号: {phone}, 验证码: {code} (SDK 待接入)")


sms_service = SmsService()
