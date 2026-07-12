"""slug 生成工具。

策略：去掉所有非 ASCII 字符，用哈希保证可读性和唯一性。
彻底避免中文等非 ASCII 字符进入 URL，消除编码问题。
"""
import hashlib
import re
import random
import string


def slugify(text: str, length: int = 40) -> str:
    """将文本转为 URL 友好的纯 ASCII slug。

    1. 移除所有非 ASCII 字符（中文、日文等）
    2. 保留字母数字和连字符
    3. 若结果太短或为空，用标题的 MD5 短哈希作为 slug
    """
    # 转小写，替换空格为连字符
    slug = text.strip().lower()
    slug = re.sub(r"[\s_]+", "-", slug)
    # 只保留 ASCII 字母、数字、连字符
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    # 清理多余连字符
    slug = re.sub(r"-{2,}", "-", slug)
    slug = slug.strip("-")

    # 如果结果太短或为空，用 MD5 短哈希 + 随机后缀
    if len(slug) < 3:
        h = hashlib.md5(text.encode("utf-8")).hexdigest()[:12]
        rand = "".join(random.choices(string.ascii_lowercase + string.digits, k=4))
        slug = f"post-{h}-{rand}"

    if len(slug) > length:
        slug = slug[:length].rstrip("-")

    return slug


def ensure_unique_slug(base: str, exists_check) -> str:
    """确保 slug 唯一，若冲突则追加数字后缀。"""
    slug = slugify(base)
    if not exists_check(slug):
        return slug
    n = 2
    while exists_check(f"{slug}-{n}"):
        n += 1
    return f"{slug}-{n}"
