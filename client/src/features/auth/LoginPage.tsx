import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Lock, User, Phone, MessageSquare, Sun, Moon, LogIn } from "lucide-react";
import Hyperspeed from "@/components/ui/Hyperspeed";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/store/authStore";
import { useUIStore } from "@/store/uiStore";
import { getApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type LoginMode = "password" | "sms";

export default function LoginPage() {
  const [mode, setMode] = useState<LoginMode>("password");
  // 密码登录
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  // 验证码登录
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSending, setCodeSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const { theme, toggleTheme } = useUIStore();
  const { toast } = useToast();

  // 倒计时
  useEffect(() => {
    if (countdown > 0) {
      timerRef.current = setInterval(() => {
        setCountdown((c) => (c <= 1 ? 0 : c - 1));
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [countdown]);

  const handleSendCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      toast("请输入正确的手机号", "error");
      return;
    }
    setCodeSending(true);
    try {
      await authApi.sendSmsCode(phone);
      toast("验证码已发送（开发环境固定为 123456）", "success");
      setCountdown(60);
    } catch (err) {
      toast(getApiError(err), "error");
    } finally {
      setCodeSending(false);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { access_token } = await authApi.login({ account, password });
      const me = await authApi.getMe();
      setAuth(me, access_token);
      toast("登录成功", "success");
      navigate("/");
    } catch (err) {
      toast(getApiError(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSmsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { access_token } = await authApi.loginBySms({ phone, code });
      const me = await authApi.getMe();
      setAuth(me, access_token);
      toast("登录成功", "success");
      navigate("/");
    } catch (err) {
      toast(getApiError(err), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 overflow-hidden">
      {/* GridScan 背景 */}
      <div className="absolute inset-0 z-0 opacity-60">
        <Hyperspeed
          effectOptions={{
            distortion: "turbulentDistortion",
            length: 400, roadWidth: 10, islandWidth: 2, lanesPerRoad: 4,
            fov: 90, fovSpeedUp: 150, speedUp: 2, carLightsFade: 0.4,
            totalSideLightSticks: 20, lightPairsPerRoadWay: 40,
            shoulderLinesWidthPercentage: 0.05, brokenLinesWidthPercentage: 0.1, brokenLinesLengthPercentage: 0.5,
            lightStickWidth: [0.12, 0.5], lightStickHeight: [1.3, 1.7],
            movingAwaySpeed: [60, 80], movingCloserSpeed: [-120, -160],
            carLightsLength: [12, 80], carLightsRadius: [0.05, 0.14],
            carWidthPercentage: [0.3, 0.5], carShiftX: [-0.8, 0.8], carFloorSeparation: [0, 5],
            colors: {
              roadColor: 0x080808, islandColor: 0x0a0a0a, background: 0x000000,
              shoulderLines: 0xFFFFFF, brokenLines: 0xFFFFFF,
              leftCars: [0xD856BF, 0x6750A2, 0xC247AC],
              rightCars: [0x03B3C3, 0x0E5EA5, 0x324555],
              sticks: 0x03B3C3,
            }
          }}
        />
      </div>
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-4 text-center">
          <img src="/logo.png" alt="Blog LAB" className="mx-auto mb-2 h-60 w-60" />
        </div>

        {/* Tab 切换 */}
        <div className="mb-4 flex rounded-lg p-1 card-glass">
          <button
            type="button"
            onClick={() => setMode("password")}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === "password"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            密码登录
          </button>
          <button
            type="button"
            onClick={() => setMode("sms")}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === "sms"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            验证码登录
          </button>
        </div>

        {mode === "password" ? (
          <form onSubmit={handlePasswordLogin} className="space-y-4 rounded-xl p-6 card-tech">
            <div className="space-y-2">
              <Label htmlFor="account">邮箱或用户名</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="account"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="admin@blogshare.com"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              还没有账号？{" "}
              <Link to="/register" className="font-medium text-primary hover:underline">
                立即注册
              </Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleSmsLogin} className="space-y-4 rounded-xl p-6 card-tech">
            <div className="space-y-2">
              <Label htmlFor="phone">手机号</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="请输入手机号"
                  className="pl-9"
                  maxLength={11}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="code">验证码</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MessageSquare className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="6 位验证码"
                    className="pl-9"
                    maxLength={6}
                    required
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={codeSending || countdown > 0}
                  className="shrink-0 min-w-[90px]"
                >
                  {countdown > 0 ? `${countdown} 秒后重发` : (codeSending ? "发送中..." : "发送验证码")}
                </Button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "登录中..." : "登录"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              还没有账号？{" "}
              <Link to="/register" className="font-medium text-primary hover:underline">
                立即注册
              </Link>
            </p>
          </form>
        )}

        {/* 游客入口 */}
        <div className="mt-4 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground/60 transition-colors hover:text-foreground"
          >
            <LogIn className="h-3.5 w-3.5" />
            游客访问 · 仅浏览
          </Link>
        </div>
      </div>

      {/* 右下角主题切换 */}
      <button
        onClick={toggleTheme}
        className="fixed bottom-6 right-6 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-border/40 bg-card/60 backdrop-blur-sm shadow-lg transition-all hover:bg-accent"
        title={theme === "dark" ? "切换到亮色" : "切换到暗色"}
      >
        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>
    </div>
  );
}
