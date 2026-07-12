import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import Galaxy from "@/components/ui/Galaxy";

/** 全局布局：左侧导航 + 顶部栏 + 内容区 */
export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background relative">
      {/* 银河粒子背景 */}
      <div className="fixed inset-0 z-0 opacity-40 dark:opacity-60 pointer-events-none">
        <Galaxy
          density={2.8}
          hueShift={280}
          starSpeed={0.5}
          glowIntensity={0.3}
          saturation={0.8}
          twinkleIntensity={0.5}
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
