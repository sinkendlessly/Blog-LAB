import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { MarkdownEditor } from "@/components/editor/MarkdownEditor";
import { EditorToolbar } from "@/components/editor/EditorToolbar";
import AIAssistant from "@/components/editor/AIAssistant";
import { articleApi } from "@/lib/api/articles";
import { categoryApi, uploadApi } from "@/lib/api/index";
import { useToast } from "@/components/ui/toast";
import { useUIStore } from "@/store/uiStore";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type SaveStatus = "saved" | "saving" | "unsaved";

const DRAFT_KEY = "editor-draft";

/** 从 localStorage 加载草稿。 */
function loadDraft(): { title: string; content: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** 保存草稿到 localStorage（防抖 1s）。 */
function saveDraft(title: string, content: string) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, savedAt: Date.now() }));
  } catch { /* localStorage 满时静默失败 */ }
}

/** 清除本地草稿。 */
function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ }
}

/** 文章编辑器页（新建 + 编辑）。Typora 风格沉浸式写作。 */
export default function EditorPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { setSidebar } = useUIStore();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [articleId, setArticleId] = useState<number | null>(id ? Number(id) || null : null);
  const [draftRestored, setDraftRestored] = useState(false);

  // 发布设置
  const [publishOpen, setPublishOpen] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [excerpt, setExcerpt] = useState("");
  const [coverImage, setCoverImage] = useState("");

  // 分类数据
  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => categoryApi.list(),
    staleTime: 10 * 60 * 1000,
  });

  // 编辑模式：加载已有文章（支持 ID 或 slug）
  const { data: article, isLoading } = useQuery({
    queryKey: ["article-edit", id],
    queryFn: () => {
      const numId = Number(id);
      return numId ? articleApi.getById(numId) : articleApi.getBySlug(id!);
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (article) {
      setTitle(article.title);
      setContent(article.content);
      setArticleId(article.id); // ← 从加载的文章中获取真实 ID，修复 slug 转 ID 为 NaN 的问题
      setCategoryId(article.category?.id);
      setTagIds(article.tags.map((t) => t.id));
      setExcerpt(article.excerpt ?? "");
      setCoverImage(article.cover_image ?? "");
    }
  }, [article]);

  // 新建文章时检查本地草稿并提示恢复
  useEffect(() => {
    if (articleId || draftRestored) return;
    const draft = loadDraft();
    if (draft && draft.title) {
      const ok = window.confirm(`检测到未保存的草稿「${draft.title}」，是否恢复？`);
      if (ok) {
        setTitle(draft.title);
        setContent(draft.content);
        setSaveStatus("unsaved");
      } else {
        clearDraft();
      }
      setDraftRestored(true);
    } else {
      setDraftRestored(true);
    }
  }, [articleId, draftRestored]);

  // 自动保存草稿到 localStorage（防抖 2s）
  const draftTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!title.trim() || articleId) return; // 编辑已有文章时不覆盖本地草稿
    clearTimeout(draftTimerRef.current);
    draftTimerRef.current = setTimeout(() => {
      saveDraft(title, content);
    }, 2000);
    return () => clearTimeout(draftTimerRef.current);
  }, [title, content, articleId]);

  // 进入编辑器时收起侧边栏
  useEffect(() => {
    setSidebar(true);
    return () => setSidebar(false);
  }, [setSidebar]);

  // 智能分类/标签推荐：标题变化后 2 秒自动建议
  const suggestTimerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (!title.trim() || articleId) return; // 编辑已有文章时跳过
    clearTimeout(suggestTimerRef.current);
    suggestTimerRef.current = setTimeout(async () => {
      try {
        const result = await articleApi.suggestTags(title, content.slice(0, 200));
        if (result.category_id && !categoryId) {
          setCategoryId(result.category_id);
        }
        if (result.tag_ids.length > 0) {
          setTagIds((prev) => {
            const combined = [...new Set([...prev, ...result.tag_ids])];
            return combined.length > 5 ? combined.slice(0, 5) : combined;
          });
        }
      } catch { /* 静默失败，不影响写作 */ }
    }, 2000);
    return () => clearTimeout(suggestTimerRef.current);
  }, [title, content, articleId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 保存 mutation
  const saveMutation = useMutation({
    mutationFn: async (data: { title?: string; content?: string; excerpt?: string; cover_image?: string; category_id?: number; tag_ids?: number[]; status?: string }) => {
      if (!articleId) {
        const created = await articleApi.create({
          title: data.title ?? (title || "无标题"),
          content: data.content ?? content,
          status: "DRAFT",
          ...data,
        });
        setArticleId(created.id);
        return created;
      }
      return articleApi.update(articleId, data);
    },
    onSuccess: () => {
      setSaveStatus("saved");
      clearDraft(); // 保存成功清除本地草稿
    },
    onError: () => {
      setSaveStatus("unsaved");
      toast("保存失败", "error");
    },
  });

  const handleSave = useCallback(
    (newContent?: string) => {
      setSaveStatus("saving");
      saveMutation.mutate({
        title: title || "无标题",
        content: newContent ?? content,
        excerpt,
        cover_image: coverImage,
        category_id: categoryId,
        tag_ids: tagIds,
      });
    },
    [title, content, excerpt, coverImage, categoryId, tagIds, saveMutation]
  );

  const handleContentChange = useCallback((val: string) => {
    setContent(val);
    setSaveStatus("unsaved");
  }, []);

  const handleTitleChange = useCallback((val: string) => {
    setTitle(val);
    setSaveStatus("unsaved");
  }, []);

  // 打开发布设置弹窗
  const handlePublishClick = () => {
    if (!title.trim()) {
      toast("请输入标题", "error");
      return;
    }
    setPublishOpen(true);
  };

  // 确认发布
  const doPublish = async () => {
    if (!title.trim()) {
      toast("请输入标题", "error");
      return;
    }
    try {
      if (!articleId) {
        const created = await articleApi.create({
          title,
          content,
          excerpt,
          cover_image: coverImage,
          category_id: categoryId,
          tag_ids: tagIds,
          status: "PENDING_REVIEW",
        });
        setArticleId(created.id);
        clearDraft();
        toast("文章已提交审核", "success");
        setPublishOpen(false);
        navigate(`/article/${encodeURIComponent(created.slug)}`);
      } else {
        await articleApi.update(articleId, {
          title,
          content,
          excerpt,
          cover_image: coverImage,
          category_id: categoryId,
          tag_ids: tagIds,
          status: "PENDING_REVIEW",
        });
        clearDraft();
        toast("文章已提交审核", "success");
        setPublishOpen(false);
        queryClient.invalidateQueries({ queryKey: ["articles"] });
        navigate(-1);
      }
    } catch {
      toast("发布失败", "error");
    }
  };

  if (id && isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <EditorToolbar
        title={title}
        onTitleChange={handleTitleChange}
        saveStatus={saveStatus}
        onPublish={handlePublishClick}
      />

      {/* 编辑器主体 — 左侧封面 + 右侧Markdown */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧封面编辑面板 */}
        <div className="flex w-56 shrink-0 flex-col border-r p-4 overflow-y-auto">
          <p className="mb-3 text-sm font-medium">文章封面</p>

          {/* 封面预览 */}
          <div className="mb-3 overflow-hidden rounded-lg border bg-muted/30" style={{ aspectRatio: "16/9" }}>
            {coverImage ? (
              <img
                src={coverImage}
                alt="封面"
                className="h-full w-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                无封面
              </div>
            )}
          </div>

          {/* URL 输入 */}
          <input
            type="text"
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="图片 URL..."
            className="mb-2 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />

          {/* 上传按钮 */}
          <div className="relative mb-2">
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 opacity-0 cursor-pointer"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const { url } = await uploadApi.image(file);
                  setCoverImage(url);
                } catch { /* silent */ }
              }}
            />
            <button
              type="button"
              className="w-full rounded-md border border-input px-3 py-1.5 text-xs transition-colors hover:bg-accent"
            >
              上传图片
            </button>
          </div>

          {/* 移除按钮 */}
          {coverImage && (
            <button
              onClick={() => setCoverImage("")}
              className="rounded-md px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-red-500"
            >
              移除封面
            </button>
          )}

          {/* 分隔线 */}
          <div className="my-3 border-t" />

          {/* 分类 */}
          <p className="mb-1.5 text-xs font-medium">分类</p>
          <select
            value={categoryId ?? ""}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : undefined)}
            className="mb-3 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">无分类</option>
            {categories?.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          {/* 标签 ID */}
          <p className="mb-1.5 text-xs font-medium">标签 ID</p>
          <input
            type="text"
            value={tagIds.join(", ")}
            onChange={(e) =>
              setTagIds(
                e.target.value
                  .split(",")
                  .map((s) => Number(s.trim()))
                  .filter((n) => !isNaN(n))
              )
            }
            placeholder="例: 1, 2, 3"
            className="mb-3 w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
          />

          {/* 摘要 — 占满剩余空间 */}
          <p className="mb-1.5 text-xs font-medium">摘要</p>
          <textarea
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="文章摘要（可选）"
            maxLength={500}
            className="flex-1 w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
            style={{ minHeight: "80px" }}
          />

          {/* AI 助手触发按钮 */}
          <button
            onClick={() => setShowAI(!showAI)}
            className="mt-2 flex items-center justify-center gap-1 rounded-md border py-1.5 text-xs transition-colors hover:bg-accent"
          >
            <Sparkles className="h-3 w-3 text-purple-500" />
            {showAI ? "关闭 AI" : "AI 助手"}
          </button>
        </div>

        {/* 右侧 Markdown 编辑器 */}
        <div className="flex-1 overflow-hidden">
          <MarkdownEditor
            value={content}
            onChange={handleContentChange}
            onSave={(v) => handleSave(v)}
            saving={saveMutation.isPending}
          />
        </div>

        {/* AI 助手侧栏 */}
        {showAI && (
          <div className="w-80 shrink-0">
            <AIAssistant
              onInsert={(text) => handleContentChange(content + "\n" + text)}
              onClose={() => setShowAI(false)}
            />
          </div>
        )}
      </div>

      {/* 发布设置弹窗 */}
      <Dialog open={publishOpen} onClose={() => setPublishOpen(false)}>
        <DialogHeader>
          <DialogTitle>发布确认</DialogTitle>
          <p className="text-sm text-muted-foreground">
            确认将文章提交审核？提交后管理员审核通过即可上线。
          </p>
        </DialogHeader>

        <DialogFooter>
          <button
            onClick={() => setPublishOpen(false)}
            className="rounded-md border border-input px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            取消
          </button>
          <button
            onClick={doPublish}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            确认提交
          </button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
