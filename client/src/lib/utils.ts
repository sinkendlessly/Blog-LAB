import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 Tailwind 类名。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 格式化日期为中文友好格式。 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)} 天前`;
  return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
}

/** 格式化数字（1000 → 1k）。 */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10000) return (n / 1000).toFixed(1) + "k";
  return (n / 10000).toFixed(1) + "w";
}

/** 生成简单 UUID（用于客户端临时 id）。 */
export function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
