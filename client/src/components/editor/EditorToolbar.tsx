import { ArrowLeft, Check, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

type SaveStatus = "saved" | "saving" | "unsaved";

interface EditorToolbarProps {
  /** 标题 */
  title: string;
  onTitleChange: (title: string) => void;
  /** 保存状态 */
  saveStatus: SaveStatus;
  /** 发布按钮点击 */
  onPublish?: () => void;
  className?: string;
}

/**
 * 极简编辑器顶栏。
 * 左侧返回按钮 + 标题输入，右侧保存状态 + 发布按钮。
 */
export function EditorToolbar({
  title,
  onTitleChange,
  saveStatus,
  onPublish,
  className,
}: EditorToolbarProps) {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-border/40 bg-background/60 px-4 py-3 backdrop-blur-sm",
        className
      )}
    >
      {/* 返回按钮 */}
      <button
        onClick={() => navigate(-1)}
        className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="返回"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>

      {/* 标题输入 */}
      <input
        type="text"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="无标题"
        className="flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-muted-foreground/30"
      />

      {/* 保存状态 */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
        {saveStatus === "saved" && (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-500" />
            <span>已保存</span>
          </>
        )}
        {saveStatus === "saving" && (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>保存中</span>
          </>
        )}
        {saveStatus === "unsaved" && (
          <>
            <Circle className="h-3 w-3 fill-current text-amber-500" />
            <span>未保存</span>
          </>
        )}
      </div>

      {/* 发布按钮 */}
      {onPublish && (
        <button
          onClick={onPublish}
          className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
        >
          发布
        </button>
      )}
    </div>
  );
}
