import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Mail, Lock, User, Phone, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/store/authStore";
import { getApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type RegisterMode = "email" | "phone";

export default function RegisterPage() {
  const [mode, setMode] = useState<RegisterMode>("email");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // 手机号注册
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSending, setCodeSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const { toast } = useToast();

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

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.register({ username, email, password });
      const { access_token } = await authApi.login({ account: email, password });
      const me = await authApi.getMe();
      setAuth(me, access_token);
      toast("注册成功，已自动登录", "success");
      navigate("/");
    } catch (err) {
      toast(getApiError(err), "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { access_token } = await authApi.registerBySms({ phone, code, username, password });
      // 注册后直接拿到 token，无需重新输入验证码
      const me = await authApi.getMe();
      setAuth(me, access_token);
      toast("注册成功，已自动登录", "success");
      navigate("/");
    } catch (err) {
      toast(getApiError(err), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold">创建账号</h1>
          <p className="mt-1 text-sm text-muted-foreground">加入 Blog LAB，开始知识分享</p>
        </div>

        {/* Tab 切换 */}
        <div className="mb-4 flex rounded-lg border bg-card p-1">
          <button
            type="button"
            onClick={() => setMode("email")}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === "email"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            邮箱注册
          </button>
          <button
            type="button"
            onClick={() => setMode("phone")}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === "phone"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            手机号注册
          </button>
        </div>

        {mode === "email" ? (
          <form onSubmit={handleEmailRegister} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="username">用户名</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="2-50 个字符"
                  className="pl-9"
                  minLength={2}
                  maxLength={50}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
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
                  placeholder="至少 6 位"
                  className="pl-9"
                  minLength={6}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "注册中..." : "注册"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              已有账号？{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                去登录
              </Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handlePhoneRegister} className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="phone-reg">手机号</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="phone-reg"
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
              <Label htmlFor="code-reg">验证码</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MessageSquare className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="code-reg"
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

            <div className="space-y-2">
              <Label htmlFor="username-reg">用户名</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username-reg"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="2-50 个字符"
                  className="pl-9"
                  minLength={2}
                  maxLength={50}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password-reg">密码</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password-reg"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="至少 6 位"
                  className="pl-9"
                  minLength={6}
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "注册中..." : "注册"}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              已有账号？{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                去登录
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
