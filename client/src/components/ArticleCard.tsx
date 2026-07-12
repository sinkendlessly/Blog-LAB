import { Link } from "react-router-dom";
import { Eye, Heart, Bookmark, Tag, BookOpen } from "lucide-react";
import { cn, formatDate, formatCount } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import type { ArticleBrief } from "@/types";

interface ArticleCardProps {
  article: ArticleBrief;
  className?: string;
  /** 水平布局（列表模式），默认垂直卡片 */
  horizontal?: boolean;
}

/** 文章卡片 — Editorial 卡片风格，精致悬浮效果。 */
export function ArticleCard({ article, className, horizontal = false }: ArticleCardProps) {
  if (horizontal) {
    return (
      <Link
        to={`/article/${encodeURIComponent(article.slug)}`}
        className={cn(
          "group flex gap-4 rounded-xl border bg-card p-4 card-hover",
          className
        )}
      >
        {article.cover_image && (
          <div className="h-24 w-36 shrink-0 overflow-hidden rounded-lg">
            <img
              src={article.cover_image}
              alt={article.title}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <h3 className="line-clamp-2 font-semibold leading-snug transition-colors group-hover:text-primary">
              {article.title}
            </h3>
            {article.excerpt && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{article.excerpt}</p>
            )}
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Avatar src={article.author.avatar} fallback={article.author.username[0]} className="h-4 w-4" />
              {article.author.username}
            </span>
            {article.published_at && <span>{formatDate(article.published_at)}</span>}
            <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{formatCount(article.views)}</span>
            <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{formatCount(article.like_count ?? 0)}</span>
            <span className="flex items-center gap-0.5"><Bookmark className="h-3 w-3" />{formatCount(article.favorite_count ?? 0)}</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/article/${encodeURIComponent(article.slug)}`}
      className={cn(
        "group flex flex-col rounded-xl overflow-hidden card-glass card-hover",
        className
      )}
    >
      {/* 封面区 — 固定 180px 高度 */}
      <div className="h-[180px] shrink-0 overflow-hidden">
        {article.cover_image ? (
          <img
            src={article.cover_image}
            alt={article.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand/5 to-primary/5">
            <BookOpen className="h-10 w-10 text-muted-foreground/20" />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 font-semibold leading-snug transition-colors group-hover:text-primary">
          {article.title}
        </h3>
        {article.excerpt && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{article.excerpt}</p>
        )}
        {article.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {article.tags.slice(0, 3).map((tag) => (
              <span key={tag.id} className="inline-flex items-center gap-0.5 rounded-full bg-secondary/70 px-2.5 py-0.5 text-[11px] text-secondary-foreground transition-colors group-hover:bg-secondary">
                <Tag className="h-2.5 w-2.5" />
                {tag.name}
              </span>
            ))}
          </div>
        )}
        <div className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Avatar src={article.author.avatar} fallback={article.author.username[0]} className="h-4 w-4" />
            {article.author.username}
          </span>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-0.5"><Eye className="h-3 w-3" />{formatCount(article.views)}</span>
            <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{formatCount(article.like_count ?? 0)}</span>
            <span className="flex items-center gap-0.5"><Bookmark className="h-3 w-3" />{formatCount(article.favorite_count ?? 0)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
