import { useState, useCallback, useRef, useEffect } from "react";
import MDEditor from "@uiw/react-md-editor";
import { cn } from "@/lib/utils";
import { uploadApi } from "@/lib/api/index";
import { useToast } from "@/components/ui/toast";
import {
  Eye, Pencil, Type, Bold, Italic, Strikethrough, Heading1, Heading2, Heading3,
  Quote, Code, List, ListOrdered, Link, Table, Image, Minus, CheckSquare,
} from "lucide-react";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSave?: (value: string) => void;
  saving?: boolean;
  className?: string;
}

type ViewMode = "live" | "edit" | "preview";

interface FormatSettings {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
}

const FONTS = [
  { label: "Sans (默认)", value: '"Noto Sans SC", sans-serif' },
  { label: "衬线体", value: '"Lora", "Noto Sans SC", serif' },
  { label: "等宽体", value: '"JetBrains Mono", monospace' },
];

const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 42, 48, 54, 60, 66, 72];

const LINE_HEIGHTS = [
  { label: "1.0 (单倍行距)", value: 1.0 },
  { label: "1.15", value: 1.15 },
  { label: "1.25", value: 1.25 },
  { label: "1.5 (1.5 倍行距)", value: 1.5 },
  { label: "1.75", value: 1.75 },
  { label: "2.0 (双倍行距)", value: 2.0 },
  { label: "2.5", value: 2.5 },
  { label: "3.0", value: 3.0 },
];

/** 在 textarea 光标位置插入格式化 Markdown。 */
function useFormatInsert(
  value: string,
  onChange: (v: string) => void,
  editorRef: React.RefObject<HTMLDivElement | null>,
) {
  return useCallback(
    (before: string, after = "") => {
      const textarea = editorRef.current?.querySelector<HTMLTextAreaElement>(
        ".w-md-editor-text textarea"
      );
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selected = value.substring(start, end);
      const newText =
        value.substring(0, start) + before + selected + after + value.substring(end);

      onChange(newText);

      // 恢复焦点并设置光标位置
      requestAnimationFrame(() => {
        textarea.focus();
        if (selected) {
          textarea.setSelectionRange(
            start + before.length,
            start + before.length + selected.length,
          );
        } else {
          textarea.setSelectionRange(
            start + before.length,
            start + before.length,
          );
        }
      });
    },
    [value, onChange, editorRef],
  );
}

/**
 * Typora 风格编辑器。
 * - 浅灰底色内容框 + 边框
 * - 上方格式工具栏（字体/字号/行距 + Markdown 格式按钮）
 * - Markdown 格式按钮：加粗、斜体、标题、引用、代码块、列表、表格、链接
 * - Ctrl+B 加粗，Ctrl+I 斜体，Ctrl+S 保存
 */
export function MarkdownEditor({
  value,
  onChange,
  onSave,
  saving = false,
  className,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<ViewMode>("live");
  const [format, setFormat] = useState<FormatSettings>(() => {
    try {
      const saved = localStorage.getItem("editor-format");
      return saved
        ? JSON.parse(saved)
        : { fontFamily: FONTS[0].value, fontSize: 18, lineHeight: 1.8 };
    } catch {
      return { fontFamily: FONTS[0].value, fontSize: 18, lineHeight: 1.8 };
    }
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const editorRef = useRef<HTMLDivElement>(null);
  const insertFormat = useFormatInsert(value, onChange, editorRef);

  // 持久化格式设置
  useEffect(() => {
    localStorage.setItem("editor-format", JSON.stringify(format));
  }, [format]);

  const updateFormat = useCallback((patch: Partial<FormatSettings>) => {
    setFormat((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleChange = useCallback(
    (val?: string) => {
      const v = val ?? "";
      onChange(v);
      if (onSave) {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => onSave(v), 2000);
      }
    },
    [onChange, onSave],
  );

  // 全局快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      // Ctrl+S → 保存
      if (isCtrl && e.key === "s") {
        e.preventDefault();
        if (onSave) onSave(value);
      }
      // Ctrl+Shift+P → 切换视图
      if (isCtrl && e.shiftKey && e.key === "P") {
        e.preventDefault();
        setMode((prev) => (prev === "live" ? "preview" : prev === "preview" ? "edit" : "live"));
      }
      // Ctrl+B → 加粗
      if (isCtrl && e.key === "b") {
        e.preventDefault();
        insertFormat("**", "**");
      }
      // Ctrl+I → 斜体
      if (isCtrl && e.key === "i") {
        e.preventDefault();
        insertFormat("*", "*");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSave, value, insertFormat]);

  const cycleMode = () => {
    setMode((prev) => (prev === "live" ? "preview" : prev === "preview" ? "edit" : "live"));
  };

  const ModeIcon = mode === "preview" ? Pencil : Eye;

  return (
    <div
      ref={editorRef}
      className={cn(
        "typora-editor relative flex h-full min-h-0 flex-col",
        mode === "preview" && "is-preview",
        mode === "edit" && "is-edit",
        className,
      )}
      data-color-mode="light"
      style={
        {
          "--editor-font": format.fontFamily,
          "--editor-size": `${format.fontSize}px`,
          "--editor-leading": format.lineHeight,
        } as React.CSSProperties
      }
    >
      {/* ═══ 格式工具栏 ═══ */}
      <FormatToolbar
        format={format}
        onUpdateFormat={updateFormat}
        insertFormat={insertFormat}
      />

      {/* ═══ 底部信息栏 ═══ */}
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-3 py-1 text-[10px] text-muted-foreground/50">
        <span>Markdown 格式 • Ctrl+B 加粗 • Ctrl+I 斜体 • Ctrl+S 保存</span>
        <div className="flex items-center gap-2">
          {saving && <span className="animate-pulse-soft">保存中...</span>}
          <span>{value.length > 0 ? `${value.length} 字` : ""}</span>
          <button
            onClick={cycleMode}
            className="rounded p-0.5 transition-colors hover:text-foreground/70"
            title="切换视图 (Ctrl+Shift+P)"
          >
            <ModeIcon className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ═══ 编辑器主体（浅灰底色，全宽全高铺满） ═══ */}
      <div className="flex-1 overflow-hidden [&_.w-md-editor]:!h-full [&_.w-md-editor-content]:!h-full [&_.w-md-editor-text]:!h-full">
        <div className="h-full bg-muted/20">
          <MDEditor
            value={value}
            onChange={handleChange}
            preview="live"
            height="100%"
            hideToolbar={true}
            visibleDragbar={false}
            style={{
              border: "none",
              boxShadow: "none",
              background: "transparent",
              height: "100%",
            }}
            textareaProps={{
              placeholder: "开始写作...",
              style: { height: "100%" },
            }}
          />
        </div>
      </div>
    </div>
  );
}

/* ========== WPS 风格格式工具栏 ========== */

type RibbonTab = "开始" | "插入" | "样式";

interface FormatToolbarProps {
  format: FormatSettings;
  onUpdateFormat: (patch: Partial<FormatSettings>) => void;
  insertFormat: (before: string, after?: string) => void;
}

function FormatToolbar({ format, onUpdateFormat, insertFormat }: FormatToolbarProps) {
  const [tab, setTab] = useState<RibbonTab>("开始");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleImageUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件", "error");
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadApi.image(file);
      insertFormat(`![${file.name.replace(/\.[^.]+$/, "")}](${url})`);
      toast("图片已上传", "success");
    } catch {
      toast("图片上传失败", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [insertFormat, toast]);

  const RIBBON_TABS: { key: RibbonTab; label: string }[] = [
    { key: "开始", label: "开始" },
    { key: "插入", label: "插入" },
    { key: "样式", label: "样式" },
  ];

  return (
    <div className="border-b border-border/50 bg-muted/20">
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      {/* Ribbon Tab 切换 */}
      <div className="flex gap-0 px-2 pt-1">
        {RIBBON_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-t px-3 py-1 text-[10px] font-medium transition-colors ${
              tab === t.key
                ? "bg-card text-foreground border border-b-0 border-border/50 -mb-px"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1 pr-1">
          <MarkdownHelp />
        </div>
      </div>

      {/* ═══ Tab: 开始 ═══ */}
      {tab === "开始" && (
        <div className="flex flex-wrap items-center gap-1 border border-border/50 bg-card px-2 py-1.5 text-xs">
          {/* 字体设置区 */}
          <div className="flex items-center gap-1 px-1.5" title="字体">
            <Type className="h-3 w-3 text-muted-foreground shrink-0" />
            <select
              value={format.fontFamily}
              onChange={(e) => onUpdateFormat({ fontFamily: e.target.value })}
              className="rounded border border-border/30 bg-background px-1.5 py-0.5 text-[10px] outline-none focus:ring-1 focus:ring-ring w-20"
            >
              {FONTS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div className="h-5 w-px bg-border/40" />

          {/* 字号 */}
          <div className="flex items-center gap-1 px-1.5" title="字号">
            <select
              value={format.fontSize}
              onChange={(e) => onUpdateFormat({ fontSize: Number(e.target.value) })}
              className="rounded border border-border/30 bg-background px-1 py-0.5 text-[10px] outline-none focus:ring-1 focus:ring-ring w-14"
            >
              {FONT_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* 行距 */}
          <div className="flex items-center gap-1 px-1.5" title="行距">
            <select
              value={format.lineHeight}
              onChange={(e) => onUpdateFormat({ lineHeight: Number(e.target.value) })}
              className="rounded border border-border/30 bg-background px-1 py-0.5 text-[10px] outline-none focus:ring-1 focus:ring-ring w-16"
            >
              {LINE_HEIGHTS.map((lh) => (
                <option key={lh.value} value={lh.value}>{lh.label}</option>
              ))}
            </select>
          </div>

          <div className="h-5 w-px bg-border/40" />

          {/* 文本格式 */}
          <span className="text-[9px] text-muted-foreground/60 px-1">字体</span>
          <FormatBtn icon={<Bold className="h-3.5 w-3.5" />} label="加粗 (Ctrl+B)" onClick={() => insertFormat("**", "**")} />
          <FormatBtn icon={<Italic className="h-3.5 w-3.5" />} label="斜体 (Ctrl+I)" onClick={() => insertFormat("*", "*")} />
          <FormatBtn icon={<Strikethrough className="h-3.5 w-3.5" />} label="删除线" onClick={() => insertFormat("~~", "~~")} />

          <div className="h-5 w-px bg-border/40" />

          {/* 段落 */}
          <span className="text-[9px] text-muted-foreground/60 px-1">段落</span>
          <FormatBtn icon={<Heading1 className="h-3.5 w-3.5" />} label="标题 1" onClick={() => insertFormat("# ", "")} />
          <FormatBtn icon={<Heading2 className="h-3.5 w-3.5" />} label="标题 2" onClick={() => insertFormat("## ", "")} />
          <FormatBtn icon={<Heading3 className="h-3.5 w-3.5" />} label="标题 3" onClick={() => insertFormat("### ", "")} />
          <FormatBtn icon={<Quote className="h-3.5 w-3.5" />} label="引用" onClick={() => insertFormat("> ", "")} />

          <div className="h-5 w-px bg-border/40" />

          {/* 列表 */}
          <span className="text-[9px] text-muted-foreground/60 px-1">列表</span>
          <FormatBtn icon={<List className="h-3.5 w-3.5" />} label="无序列表" onClick={() => insertFormat("- ", "")} />
          <FormatBtn icon={<ListOrdered className="h-3.5 w-3.5" />} label="有序列表" onClick={() => insertFormat("1. ", "")} />
          <FormatBtn icon={<CheckSquare className="h-3.5 w-3.5" />} label="任务列表" onClick={() => insertFormat("- [ ] ", "")} />
        </div>
      )}

      {/* ═══ Tab: 插入 ═══ */}
      {tab === "插入" && (
        <div className="flex flex-wrap items-center gap-1 border border-border/50 bg-card px-2 py-1.5 text-xs">
          <FormatBtn icon={<Image className="h-3.5 w-3.5" />} label={uploading ? "上传中..." : "图片"} onClick={() => fileInputRef.current?.click()} />
          <FormatBtn icon={<Link className="h-3.5 w-3.5" />} label="链接" onClick={() => insertFormat("[", "](url)")} />
          <FormatBtn icon={<Code className="h-3.5 w-3.5" />} label="代码块" onClick={() => insertFormat("```\n", "\n```")} />
          <FormatBtn icon={<Table className="h-3.5 w-3.5" />} label="表格" onClick={() =>
            insertFormat("| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n", "")
          } />
          <FormatBtn icon={<Minus className="h-3.5 w-3.5" />} label="分隔线" onClick={() => insertFormat("\n---\n", "")} />
          {uploading && <span className="text-[10px] text-muted-foreground animate-pulse">上传中...</span>}
        </div>
      )}

      {/* ═══ Tab: 样式 ═══ */}
      {tab === "样式" && (
        <div className="flex flex-wrap items-center gap-1 border border-border/50 bg-card px-2 py-1.5 text-xs">
          <StyleBtn label="正文" desc="默认正文样式" onClick={() => insertFormat("", "")} />
          <StyleBtn label="标题 1" desc="大标题" className="text-base font-bold" onClick={() => insertFormat("# ", "")} />
          <StyleBtn label="标题 2" desc="中标题" className="text-sm font-semibold" onClick={() => insertFormat("## ", "")} />
          <StyleBtn label="标题 3" desc="小标题" className="text-xs font-semibold" onClick={() => insertFormat("### ", "")} />
          <StyleBtn label="引用" desc="引用他人内容" className="border-l-2 border-muted-foreground/30 pl-2 text-xs italic" onClick={() => insertFormat("> ", "")} />
          <StyleBtn label="代码" desc="代码片段" className="font-mono text-xs rounded bg-muted px-1" onClick={() => insertFormat("`", "`")} />
          <StyleBtn label="列表" desc="无序列表" onClick={() => insertFormat("- ", "")} />
          <StyleBtn label="任务" desc="待办事项" onClick={() => insertFormat("- [ ] ", "")} />
        </div>
      )}
    </div>
  );
}

/** 样式预设按钮（WPS 样式库风格）。 */
function StyleBtn({ label, desc, className, onClick }: {
  label: string; desc: string; className?: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-16 flex-col items-center gap-0.5 rounded px-2 py-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={desc}
    >
      <span className={cn("truncate w-full text-center", className)}>{label}</span>
      <span className="text-[8px] text-muted-foreground/50 truncate w-full text-center">{desc}</span>
    </button>
  );
}

/** Markdown 语法参考下拉。 */
function MarkdownHelp() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Markdown 语法参考"
      >
        ?
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-80 rounded-lg border bg-card p-4 shadow-lg animate-in fade-in zoom-in-95">
            <h4 className="mb-2 text-xs font-semibold">Markdown 语法参考</h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-1 pr-2 font-medium">效果</th>
                  <th className="pb-1 font-medium">写法</th>
                </tr>
              </thead>
              <tbody>
                <tr><td className="py-1 pr-2"><strong>加粗</strong></td><td className="py-1 font-mono text-[10px]">**文字**</td></tr>
                <tr><td className="py-1 pr-2"><em>斜体</em></td><td className="py-1 font-mono text-[10px]">*文字*</td></tr>
                <tr><td className="py-1 pr-2"><span className="text-base font-bold">标题 1</span></td><td className="py-1 font-mono text-[10px]"># 文字</td></tr>
                <tr><td className="py-1 pr-2"><span className="text-sm font-semibold">标题 2</span></td><td className="py-1 font-mono text-[10px]">## 文字</td></tr>
                <tr><td className="py-1 pr-2">无序列表</td><td className="py-1 font-mono text-[10px]">- 文字</td></tr>
                <tr><td className="py-1 pr-2">有序列表</td><td className="py-1 font-mono text-[10px]">1. 文字</td></tr>
                <tr><td className="py-1 pr-2" colSpan={2}><code className="text-[10px]">`代码`</code></td><td className="py-1 font-mono text-[10px]">`代码`</td></tr>
                <tr><td className="py-1 pr-2">引用</td><td className="py-1 font-mono text-[10px]">&gt; 文字</td></tr>
                <tr><td className="py-1 pr-2">链接</td><td className="py-1 font-mono text-[10px]">[文字](url)</td></tr>
                <tr><td className="py-1 pr-2">图片</td><td className="py-1 font-mono text-[10px]">![alt](url)</td></tr>
                <tr><td className="py-1 pr-2">代码块</td><td className="py-1 font-mono text-[10px]">```语言 ↵ 代码 ↵ ```</td></tr>
                <tr><td className="py-1 pr-2">表格</td><td className="py-1 font-mono text-[10px]">| 列1 | 列2 |</td></tr>
              </tbody>
            </table>
            <p className="mt-2 border-t pt-2 text-[10px] text-muted-foreground">
              <strong>操作方式</strong>：选中文字后点格式按钮，或直接用键盘输入语法。编辑器下方实时预览渲染效果。
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function FormatBtn({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title={label}
    >
      {icon}
    </button>
  );
}
