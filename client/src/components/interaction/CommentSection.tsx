import { useEffect, useState } from "react";
import { MessageSquare, Send, Trash2, Heart } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { commentApi } from "@/lib/api/index";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/ui/toast";
import type { Comment } from "@/types";

interface CommentSectionProps {
  articleId: number;
  /** 文章作者的 user id（用于判断显示删除按钮） */
  authorId?: number;
  className?: string;
}

/** 嵌套评论区组件（默认展开，支持点赞）。 */
export function CommentSection({ articleId, authorId, className }: CommentSectionProps) {
  const { isAuthenticated, user } = useAuthStore();
  const { toast } = useToast();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sort, setSort] = useState<"latest" | "oldest" | "hot">("latest");

  useEffect(() => {
    loadComments();
  }, [articleId]);

  const loadComments = async (sortBy?: string) => {
    setLoading(true);
    try {
      const data = await commentApi.list(articleId, sortBy ?? sort);
      setComments(data);
    } catch {
      toast("加载评论失败", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSortChange = (newSort: "latest" | "oldest" | "hot") => {
    setSort(newSort);
    loadComments(newSort);
  };

  /** 发表评论（顶层） */
  const handleSubmit = async () => {
    const content = newContent.trim();
    if (!content) return;

    setSubmitting(true);
    try {
      const newComment = await commentApi.create(articleId, content);
      setComments((prev) => [newComment, ...prev]);
      setNewContent("");
      toast("评论成功", "success");
    } catch {
      toast("评论失败", "error");
    } finally {
      setSubmitting(false);
    }
  };

  /** 回复评论 */
  const handleReply = async (parentId: number, content: string) => {
    if (!content.trim()) return;
    try {
      const newComment = await commentApi.create(articleId, content, parentId);
      setComments((prev) =>
        prev.map((c) =>
          c.id === parentId
            ? { ...c, replies: [...c.replies, newComment] }
            : c
        )
      );
      toast("回复成功", "success");
    } catch {
      toast("回复失败", "error");
    }
  };

  const handleDelete = async (commentId: number) => {
    try {
      await commentApi.remove(commentId);
      setComments((prev) => removeComment(prev, commentId));
      toast("已删除", "success");
    } catch {
      toast("删除失败", "error");
    }
  };

  /** 评论点赞 */
  const handleLike = async (commentId: number) => {
    if (!isAuthenticated) {
      toast("请先登录", "error");
      return;
    }
    try {
      const { liked, like_count } = await commentApi.toggleLike(commentId);
      updateLikeInTree(comments, commentId, liked, like_count);
      setComments([...comments]);
    } catch {
      toast("操作失败", "error");
    }
  };

  const updateLikeInTree = (items: Comment[], id: number, liked: boolean, count: number) => {
    for (const c of items) {
      if (c.id === id) {
        c.is_liked = liked;
        c.like_count = count;
        return;
      }
      if (c.replies?.length) updateLikeInTree(c.replies, id, liked, count);
    }
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* 标题 + 排序 */}
      <div className="flex items-center gap-3">
        <MessageSquare className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">评论</h3>
        <div className="flex items-center gap-1 ml-2">
          {(["latest", "hot", "oldest"] as const).map((s) => (
            <button
              key={s}
              onClick={() => handleSortChange(s)}
              className={cn(
                "rounded px-2 py-0.5 text-xs transition-colors",
                sort === s
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s === "latest" ? "最新" : s === "hot" ? "最热" : "最早"}
            </button>
          ))}
        </div>
      </div>

      {/* 发表评论 */}
      {isAuthenticated ? (
        <div className="flex gap-3">
          <Avatar
            src={user?.avatar}
            fallback={user?.username?.[0]?.toUpperCase() ?? "U"}
            className="h-8 w-8 shrink-0"
          />
          <div className="flex-1 space-y-2">
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="写下你的评论..."
              rows={3}
              className="resize-none"
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!newContent.trim() || submitting}
              >
                <Send className="mr-1 h-3.5 w-3.5" />
                {submitting ? "发送中..." : "发送"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">登录后即可评论</p>
      )}

      {/* 评论列表 */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="flex gap-3 animate-pulse-soft">
              <div className="h-7 w-7 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 rounded bg-muted" />
                <div className="h-4 w-full rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">暂无评论，来说两句吧</p>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              currentUserId={user?.id}
              isAdmin={user?.role === "ADMIN"}
              articleAuthorId={authorId}
              onReply={handleReply}
              onDelete={handleDelete}
              onLike={handleLike}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 单条评论（递归渲染回复 + 点赞按钮）。 */
function CommentItem({
  comment,
  currentUserId,
  isAdmin,
  articleAuthorId,
  onReply,
  onDelete,
  onLike,
  depth = 0,
}: {
  comment: Comment;
  currentUserId?: number;
  isAdmin?: boolean;
  articleAuthorId?: number;
  onReply: (parentId: number, content: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onLike: (id: number) => Promise<void>;
  depth?: number;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isOwner = currentUserId === comment.user.id;
  const canDelete = isOwner || isAdmin || currentUserId === articleAuthorId;

  const handleReplySubmit = async () => {
    if (!replyContent.trim()) return;
    setSubmitting(true);
    try {
      await onReply(comment.id, replyContent.trim());
      setReplyContent("");
      setReplyOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteClick = async () => {
    setDeleting(true);
    try {
      await onDelete(comment.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className={cn(depth > 0 && "ml-8 border-l-2 border-border pl-4")}>
      <div className="flex gap-3">
        <Avatar
          src={comment.user.avatar}
          fallback={comment.user.username[0].toUpperCase()}
          className="h-7 w-7 shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{comment.user.username}</span>
            {comment.user.id === currentUserId && (
              <span className="text-xs rounded bg-primary/10 px-1.5 py-0.5 font-medium text-primary">你</span>
            )}
            {comment.user.id === articleAuthorId && comment.user.id !== currentUserId && (
              <span className="text-xs rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">作者</span>
            )}
            <span className="text-xs text-muted-foreground">{formatDate(comment.created_at)}</span>
          </div>
          <p className="mt-1 text-sm whitespace-pre-wrap">{comment.content}</p>

          {/* 操作栏 */}
          <div className="mt-1 flex items-center gap-3">
            {/* 点赞按钮 */}
            <button
              onClick={() => onLike(comment.id)}
              className={cn(
                "inline-flex items-center gap-1 text-xs transition-colors",
                comment.is_liked
                  ? "text-red-500 hover:text-red-600"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Heart className={cn("h-3 w-3", comment.is_liked && "fill-current")} />
              {(comment.like_count ?? 0) > 0 && comment.like_count}
            </button>

            {/* 回复按钮 */}
            <button
              onClick={() => setReplyOpen(!replyOpen)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              回复
            </button>

            {/* 删除按钮 */}
            {canDelete && (
              <button
                onClick={handleDeleteClick}
                disabled={deleting}
                className="text-xs text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
              >
                {deleting ? "删除中..." : <Trash2 className="h-3 w-3" />}
              </button>
            )}
          </div>

          {/* 回复框 */}
          {replyOpen && (
            <div className="mt-2 space-y-2">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder={`回复 ${comment.user.username}...`}
                rows={2}
                className="resize-none text-sm"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setReplyOpen(false)}>
                  取消
                </Button>
                <Button size="sm" onClick={handleReplySubmit} disabled={!replyContent.trim() || submitting}>
                  {submitting ? "发送中..." : "回复"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 递归渲染子评论 */}
      {comment.replies?.length > 0 && (
        <div className="mt-3 space-y-3">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              articleAuthorId={articleAuthorId}
              onReply={onReply}
              onDelete={onDelete}
              onLike={onLike}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** 递归删除评论。 */
function removeComment(comments: Comment[], id: number): Comment[] {
  return comments
    .filter((c) => c.id !== id)
    .map((c) => ({
      ...c,
      replies: removeComment(c.replies, id),
    }));
}
