import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Save, Loader2, User, Lock, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { userApi, uploadApi } from "@/lib/api/index";
import { authApi } from "@/lib/api/auth";
import { useAuthStore } from "@/store/authStore";
import { useToast } from "@/components/ui/toast";
import { getApiError } from "@/lib/api";

/** 手机号脱敏：138****1234 */
function maskPhone(phone: string | null): string {
  if (!phone) return "未绑定";
  return phone.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2");
}

/** 设置页：修改个人信息 + 手机号绑定 + 修改密码。 */
export default function SettingsPage() {
  const { user, setUser } = useAuthStore();
  const { toast } = useToast();

  // 个人信息
  const [username, setUsername] = useState(user?.username ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [avatar, setAvatar] = useState(user?.avatar ?? "");
  const [avatarUploading, setAvatarUploading] = useState(false);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("请选择图片文件", "error");
      return;
    }
    setAvatarUploading(true);
    try {
      const { url } = await uploadApi.image(file);
      setAvatar(url);
      // 自动保存头像
      const updated = await userApi.updateMe({ username, bio, avatar: url });
      setUser(updated);
      toast("头像已更新", "success");
    } catch {
      toast("头像上传失败", "error");
    } finally {
      setAvatarUploading(false);
    }
  };

  // 手机号绑定
  const [bindPhone, setBindPhone] = useState("");
  const [bindCode, setBindCode] = useState("");
  const [codeSending, setCodeSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // 修改密码
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (countdown > 0) {
      timerRef.current = setInterval(() => {
        setCountdown((c) => (c <= 1 ? 0 : c - 1));
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [countdown]);

  const updateProfileMutation = useMutation({
    mutationFn: () => userApi.updateMe({ username, bio, avatar }),
    onSuccess: (updated) => {
      setUser(updated);
      toast("资料已更新", "success");
    },
    onError: () => toast("更新失败", "error"),
  });

  const changePasswordMutation = useMutation({
    mutationFn: () => authApi.changePassword({ old_password: oldPassword, new_password: newPassword }),
    onSuccess: () => {
      toast("密码已修改", "success");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: () => toast("密码修改失败，请检查旧密码", "error"),
  });

  const bindPhoneMutation = useMutation({
    mutationFn: () => userApi.bindPhone(bindPhone, bindCode),
    onSuccess: (updated) => {
      setUser(updated);
      toast("手机号绑定成功", "success");
      setBindPhone("");
      setBindCode("");
    },
    onError: (err) => toast(getApiError(err), "error"),
  });

  const handleSaveProfile = () => {
    if (!username.trim()) {
      toast("用户名不能为空", "error");
      return;
    }
    updateProfileMutation.mutate();
  };

  const handleChangePassword = () => {
    if (newPassword.length < 6) {
      toast("新密码至少 6 位", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast("两次密码不一致", "error");
      return;
    }
    changePasswordMutation.mutate();
  };

  const handleSendBindCode = async () => {
    if (!/^1[3-9]\d{9}$/.test(bindPhone)) {
      toast("请输入正确的手机号", "error");
      return;
    }
    setCodeSending(true);
    try {
      await authApi.sendSmsCode(bindPhone);
      toast("验证码已发送（开发环境固定为 123456）", "success");
      setCountdown(60);
    } catch (err) {
      toast(getApiError(err), "error");
    } finally {
      setCodeSending(false);
    }
  };

  const handleBindPhone = () => {
    if (!/^1[3-9]\d{9}$/.test(bindPhone)) {
      toast("请输入正确的手机号", "error");
      return;
    }
    if (bindCode.length !== 6) {
      toast("请输入 6 位验证码", "error");
      return;
    }
    bindPhoneMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-8 text-2xl font-bold">设置</h1>

      {/* 个人信息 */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <User className="h-5 w-5" /> 个人信息
        </h2>

        <div className="space-y-4">
          {/* 头像 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">头像</label>
            <div className="flex items-center gap-4">
              <Avatar src={avatar} fallback={username.slice(0, 2).toUpperCase()} className="h-16 w-16 shrink-0" />
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="text"
                  value={avatar}
                  onChange={(e) => setAvatar(e.target.value)}
                  placeholder="头像 URL"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="relative">
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleAvatarUpload}
                    disabled={avatarUploading}
                  />
                  <Button variant="outline" size="sm" disabled={avatarUploading} asChild>
                    <span>{avatarUploading ? "上传中..." : "上传"}</span>
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* 用户名 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* 简介 */}
          <div>
            <label className="mb-1.5 block text-sm font-medium">简介</label>
            <textarea
              value={bio ?? ""}
              onChange={(e) => setBio(e.target.value)}
              placeholder="介绍一下自己..."
              rows={3}
              maxLength={500}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          <Button onClick={handleSaveProfile} disabled={updateProfileMutation.isPending}>
            {updateProfileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            保存
          </Button>
        </div>
      </section>

      {/* 手机号绑定 */}
      <section className="mb-10">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Phone className="h-5 w-5" /> 手机号
        </h2>

        <div className="mb-4 rounded-md border bg-muted/30 px-4 py-3 text-sm">
          当前手机号：<span className="font-medium">{maskPhone(user?.phone ?? null)}</span>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bind-phone">新手机号</Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="bind-phone"
                value={bindPhone}
                onChange={(e) => setBindPhone(e.target.value)}
                placeholder="请输入手机号"
                className="pl-9"
                maxLength={11}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bind-code">验证码</Label>
            <div className="flex gap-2">
              <Input
                id="bind-code"
                value={bindCode}
                onChange={(e) => setBindCode(e.target.value)}
                placeholder="6 位验证码"
                maxLength={6}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSendBindCode}
                disabled={codeSending || countdown > 0}
                className="shrink-0 min-w-[90px]"
              >
                {countdown > 0 ? `${countdown} 秒后重发` : (codeSending ? "发送中..." : "发送验证码")}
              </Button>
            </div>
          </div>

          <Button onClick={handleBindPhone} disabled={bindPhoneMutation.isPending}>
            {bindPhoneMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
            {user?.phone ? "换绑手机号" : "绑定手机号"}
          </Button>
        </div>
      </section>

      {/* 修改密码 */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Lock className="h-5 w-5" /> 修改密码
        </h2>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium">旧密码</label>
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">新密码</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">确认新密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button onClick={handleChangePassword} disabled={changePasswordMutation.isPending}>
            {changePasswordMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
            修改密码
          </Button>
        </div>
      </section>
    </div>
  );
}
