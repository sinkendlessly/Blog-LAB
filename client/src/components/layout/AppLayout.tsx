import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import Galaxy from "@/components/ui/Galaxy";
import { useUIStore } from "@/store/uiStore";

/** 全局布局：左侧导航 + 顶部栏 + 内容区 */
export function AppLayout() {
  const theme = useUIStore((s) => s.theme);
  const isDark = theme === "dark";

  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
      {/* 银河粒子背景 — 暗色紫色调 / 亮色暖金色调 */}
      <div className="fixed inset-0 z-0 pointer-events-none"
        style={{ opacity: isDark ? 0.6 : 0.25 }}
      >
        <Galaxy
          density={isDark ? 2.8 : 1.5}
          hueShift={isDark ? 280 : 45}
          starSpeed={0.5}
          glowIntensity={isDark ? 0.3 : 0.1}
          saturation={isDark ? 0.8 : 0.3}
          twinkleIntensity={isDark ? 0.5 : 0.2}
          rotationSpeed={0.05}
          repulsionStrength={3}
          transparent={true}
        />
      </div>
      {/* 内容层 */}
      <div className="relative z-10 flex h-screen w-full">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto scrollbar-thin">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
