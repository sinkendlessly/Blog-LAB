"""Redis key 命名规范常量。

集中管理所有 Redis key，避免散落字符串拼接出错。
"""


class RedisKeys:
    # ===== 文章互动 =====
    @staticmethod
    def article_likes(article_id: int) -> str:
        """点赞用户集合 (SET)"""
        return f"article:{article_id}:likes"

    @staticmethod
    def article_like_count(article_id: int) -> str:
        """点赞计数 (STRING)"""
        return f"article:{article_id}:like_count"

    @staticmethod
    def article_favorites(article_id: int) -> str:
        """收藏用户集合 (SET)"""
        return f"article:{article_id}:favorites"

    @staticmethod
    def article_fav_count(article_id: int) -> str:
        """收藏计数 (STRING)"""
        return f"article:{article_id}:fav_count"

    @staticmethod
    def article_views(article_id: int) -> str:
        """浏览量 (STRING, INCR)"""
        return f"article:{article_id}:views"

    @staticmethod
    def article_comment_count(article_id: int) -> str:
        """评论计数 (STRING)"""
        return f"article:{article_id}:comment_count"

    # ===== 排行榜 =====
    HOT_ARTICLES = "ranking:hot:articles"  # 热门文章 (ZSet)

    # ===== 认证 =====
    @staticmethod
    def token_blacklist(jti: str) -> str:
        """JWT 黑名单 (STRING + TTL)"""
        return f"blacklist:token:{jti}"

    # ===== 限流 =====
    @staticmethod
    def rate_limit(user_key: str, endpoint: str) -> str:
        """API 限流计数 (STRING + TTL)"""
        return f"ratelimit:{user_key}:{endpoint}"

    # ===== 缓存 =====
    @staticmethod
    def articles_list_cache(page: int, category: str = "all") -> str:
        """文章列表缓存 (STRING + TTL)"""
        return f"cache:articles:list:{category}:{page}"

    # ===== 用户 =====
    @staticmethod
    def user_history(user_id: int) -> str:
        """用户浏览历史 (LIST)"""
        return f"user:{user_id}:history"

    @staticmethod
    def user_following_set(user_id: int) -> str:
        """用户关注集合 (SET)"""
        return f"user:{user_id}:following"

    # ===== 验证码 =====
    @staticmethod
    def captcha(email: str) -> str:
        """邮箱验证码 (STRING + TTL)"""
        return f"captcha:{email}"

    @staticmethod
    def sms_code(phone: str) -> str:
        """短信验证码 (STRING + TTL 300s)"""
        return f"sms:code:{phone}"

    @staticmethod
    def sms_rate_limit(phone: str) -> str:
        """短信发送频率限制 (STRING + TTL 60s)"""
        return f"sms:rate:{phone}"
