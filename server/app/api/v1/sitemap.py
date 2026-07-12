"""网站地图 (sitemap.xml) 路由。"""
from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.deps import get_db
from app.models.article import Article

router = APIRouter()


@router.get("/sitemap.xml", summary="网站地图", include_in_schema=False)
async def sitemap(db: AsyncSession = Depends(get_db)):
    """生成 sitemap.xml，包含所有已发布的文章。"""
    result = await db.execute(
        select(Article)
        .where(Article.status == "PUBLISHED")
        .order_by(Article.published_at.desc())
    )
    articles = result.scalars().all()

    urls = [
        f"""  <url>
    <loc>https://blogshare.app/article/{a.slug}</loc>
    <lastmod>{(a.updated_at or a.created_at).strftime("%Y-%m-%d")}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>"""
        for a in articles
    ]

    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://blogshare.app/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://blogshare.app/articles</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>https://blogshare.app/archive</loc>
    <changefreq>weekly</changefreq>
    <priority>0.5</priority>
  </url>
{chr(10).join(urls)}
</urlset>"""
    return Response(content=xml, media_type="application/xml")
