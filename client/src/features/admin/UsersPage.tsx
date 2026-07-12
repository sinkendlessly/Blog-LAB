import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, Ban, CheckCircle, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { adminApi } from "@/lib/api/index";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/utils";
import { useState } from "react";
import { useAuthStore } from "@/store/authStore";

/** 用户管理页面。 */
export default function UsersPage() {
  const { toast } = useToast();
  const { user: me } = useAuthStore();
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => adminApi.listUsers(100),
    staleTime: 2 * 60 * 1000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      adminApi.setUserStatus(id, isActive),
    onSuccess: (_, { isActive }) => {
      toast(isActive ? "用户已启用" : "用户已禁用", "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: () => toast("操作失败", "error"),
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      adminApi.setUserRole(id, role),
    onSuccess: (_, { role }) => {
      toast(`已设为${role === "ADMIN" ? "管理员" : "普通用户"}`, "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: () => toast("操作失败", "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteUser(id),
    onSuccess: () => {
      toast("用户已删除", "success");
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setConfirmId(null);
    },
    onError: () => toast("删除失败", "error"),
  });

  const users = (usersData as any)?.items ?? (usersData as any[]) ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">用户管理</h1>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium">用户</th>
              <th className="px-4 py-3 text-left font-medium">邮箱</th>
              <th className="px-4 py-3 text-left font-medium">角色</th>
              <th className="px-4 py-3 text-left font-medium">状态</th>
              <th className="px-4 py-3 text-left font-medium">注册日期</th>
              {me?.role === "ADMIN" && <th className="px-4 py-3 text-right font-medium">操作</th>}
            </tr>
          </thead>
          <tbody>
            {(users as any[]).map((u: any) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-accent/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Avatar src={u.avatar} fallback={u.username?.[0] ?? "?"} className="h-8 w-8" />
                    <span className="font-medium">{u.username}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={u.role === "ADMIN" ? "default" : "secondary"} className="text-xs">
                    {u.role === "ADMIN" ? "管理员" : "用户"}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    variant={u.is_active ? "secondary" : "destructive"}
                    className="text-xs"
                  >
                    {u.is_active ? "正常" : "禁用"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{formatDate(u.created_at)}</td>
                {me?.role === "ADMIN" ? (
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      {/* 普通管理员不能禁用它人管理员 */}
                      {(u.role !== "ADMIN" || me?.is_super_admin) && (
                        u.is_active ? (
                          <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600"
                            onClick={() => statusMutation.mutate({ id: u.id, isActive: false })}>
                            <Ban className="mr-1 h-3.5 w-3.5" /> 禁用
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700"
                            onClick={() => statusMutation.mutate({ id: u.id, isActive: true })}>
                            <CheckCircle className="mr-1 h-3.5 w-3.5" /> 启用
                          </Button>
                        )
                      )}
                      {/* 超管特权：设管理员 + 删除 */}
                      {me?.is_super_admin && u.role !== "ADMIN" && (
                        <Button variant="ghost" size="sm"
                          onClick={() => roleMutation.mutate({ id: u.id, role: "ADMIN" })}>
                          <Shield className="mr-1 h-3.5 w-3.5" /> 设管理员
                        </Button>
                      )}
                      {me?.is_super_admin && u.id !== me?.id && u.role !== "ADMIN" && (
                        <>
                          {confirmId === u.id ? (
                            <div className="flex items-center gap-1">
                              <Button variant="destructive" size="sm"
                                onClick={() => deleteMutation.mutate(u.id)}
                                disabled={deleteMutation.isPending}>确认</Button>
                              <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>取消</Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="sm" className="text-red-700 hover:text-red-800"
                              onClick={() => setConfirmId(u.id)}>
                              <Trash2 className="mr-1 h-3.5 w-3.5" /> 删除
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                ) : (
                  <td className="px-4 py-3 text-right text-xs text-muted-foreground">只读</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
