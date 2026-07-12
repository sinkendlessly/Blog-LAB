"""RSS / Atom 订阅。"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.article import Article
from app.models.user import User

router = APIRouter(tags=["订阅"])


@router.get("/feed", responses={200: {"content": {"application/xml": {}}}})
async def rss_feed(db: AsyncSession = Depends(get_db)):
    """RSS 2.0 订阅。"""
    result = await db.execute(
        select(Article)
        .where(Article.status == "PUBLISHED")
        .options(selectinload(Article.author))
        .order_by(Article.published_at.desc())
        .limit(20)
    )
    articles = result.scalars().all()

    now = datetime.now(timezone.utc)
    items = []
    for a in articles:
        pub = a.published_at or a.created_at
        items.append(f"""
    <item>
      <title><![CDATA[{a.title}]]></title>
      <link>https://blogshare.app/article/{a.slug}</link>
      <guid>https://blogshare.app/article/{a.slug}</guid>
      <description><![CDATA[{a.excerpt or a.title}]]></description>
      <author><![CDATA[{a.author.username}]]></author>
      <pubDate>{_rss_date(pub)}</pubDate>
    </item>""")

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>BlogShare</title>
    <link>https://blogshare.app</link>
    <description>知识社区博客平台 - 分享技术与思考</description>
    <language>zh-CN</language>
    <lastBuildDate>{_rss_date(now)}</lastBuildDate>
    <atom:link href="https://blogshare.app/api/v1/feed" rel="self" type="application/rss+xml"/>
    {''.join(items)}
  </channel>
</rss>"""

    return Response(content=xml.strip(), media_type="application/xml")


def _rss_date(dt: datetime) -> str:
    """格式化为 RSS 标准时间 (RFC 822)。"""
    return dt.strftime("%a, %d %b %Y %H:%M:%S +0000")
