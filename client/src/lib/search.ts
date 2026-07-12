import FlexSearch from "flexsearch";
import type { ArticleIndexItem } from "@/types";

export interface SearchResult {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  author: { id: number; username: string; avatar: string | null };
  tags: { id: number; name: string; slug: string }[];
  /** 匹配的字段 */
  field: "title" | "content" | "tags";
}

/** flexsearch 索引单例，供 SearchDialog 和首页搜索使用。 */
class SearchIndexService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private index: any = null;
  private articles: Map<number, ArticleIndexItem> = new Map();
  private built = false;

  /** 批量建索引。 */
  buildIndex(items: ArticleIndexItem[]) {
    this.index = new FlexSearch.Document({
      document: {
        id: "id",
        index: [
          { field: "title", tokenize: "forward", resolution: 10 },
          { field: "content", tokenize: "forward", resolution: 5 },
          { field: "tags", tokenize: "forward", resolution: 8 },
        ],
        store: ["title", "slug", "excerpt"],
      },
      encode: false,
      // CJK 字符按单字分词
      tokenize: (str: string) => {
        const cjk = /[一-鿿鿿㐀-䶿]/;
        const tokens: string[] = [];
        let buf = "";
        for (const ch of str.toLowerCase()) {
          if (cjk.test(ch)) {
            if (buf) tokens.push(buf);
            tokens.push(ch);
            buf = "";
          } else if (/[\s\p{P}]/u.test(ch)) {
            if (buf) tokens.push(buf);
            buf = "";
          } else {
            buf += ch;
          }
        }
        if (buf) tokens.push(buf);
        return tokens;
      },
    });

    this.articles.clear();
    for (const item of items) {
      this.articles.set(item.id, item);
      this.index.add({
        id: item.id,
        title: item.title,
        content: item.content.slice(0, 2000), // 只索引前 2000 字符，节省内存
        tags: item.tags.map((t) => t.name).join(" "),
      });
    }
    this.built = true;
  }

  /** 搜索，返回匹配结果（去重，最多 20 条）。 */
  search(query: string): SearchResult[] {
    if (!this.index || !query.trim()) return [];

    const raw = this.index.search(query, { limit: 20, enrich: true });
    // raw 是数组，每个元素对应一个字段的搜索结果
    const seen = new Set<number>();
    const results: SearchResult[] = [];

    const fieldOrder: ("title" | "content" | "tags")[] = ["title", "tags", "content"];

    for (let fi = 0; fi < raw.length && fi < fieldOrder.length; fi++) {
      const field = fieldOrder[fi];
      const hits = raw[fi]?.result ?? [];
      for (const hit of hits) {
        const id = typeof hit === "number" ? hit : (hit as any).id ?? hit;
        if (seen.has(id)) continue;
        seen.add(id);
        const article = this.articles.get(id);
        if (!article) continue;
        results.push({
          id: article.id,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          author: article.author,
          tags: article.tags,
          field,
        });
      }
    }
    return results;
  }

  /** 高亮匹配词，用 <mark> 标签包裹。 */
  highlight(text: string, query: string): string {
    if (!query.trim()) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(${escaped})`, "gi");
    return text.replace(re, "<mark>$1</mark>");
  }

  /** 索引是否已构建。 */
  get isBuilt() {
    return this.built;
  }
}

export const searchIndex = new SearchIndexService();
