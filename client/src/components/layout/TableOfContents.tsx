import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface TocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

/** 从 Markdown 渲染后的 HTML 中提取 h1-h3 标题。 */
export function extractToc(contentEl: HTMLElement): TocItem[] {
  const headings = contentEl.querySelectorAll("h1, h2, h3");
  const items: TocItem[] = [];
  headings.forEach((h, idx) => {
    const level = Number(h.tagName[1]) as 1 | 2 | 3;
    // 如果标题没有 id，自动生成一个
    if (!h.id) h.id = `toc-heading-${idx}`;
    items.push({ id: h.id, text: h.textContent || "", level });
  });
  return items;
}

interface TableOfContentsProps {
  items: TocItem[];
  className?: string;
}

/** 文章目录大纲，IntersectionObserver 跟踪高亮。 */
export function TableOfContents({ items, className }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    if (!items.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0.1 }
    );

    // 延迟观察，等 DOM 渲染完毕
    const timer = setTimeout(() => {
      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el) observer.observe(el);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [items]);

  const handleClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  };

  if (!items.length) return null;

  return (
    <nav className={cn("space-y-1 text-sm", className)}>
      <h4 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        目录
      </h4>
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => handleClick(item.id)}
          className={cn(
            "block w-full truncate rounded px-2 py-1 text-left transition-colors",
            item.level === 1 && "font-medium",
            item.level === 2 && "pl-4",
            item.level === 3 && "pl-7 text-xs",
            activeId === item.id
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.text}
        </button>
      ))}
    </nav>
  );
}
