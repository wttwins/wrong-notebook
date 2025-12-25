"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Trash2, Ban, CheckCircle, Loader2, UserPlus } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { AdminUser, AppConfig } from "@/types/api";

export function UserManagement() {
    const { data: session } = useSession();
    const { t } = useLanguage();
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [allowRegistration, setAllowRegistration] = useState(true);
    const [savingRegistration, setSavingRegistration] = useState(false);

    // 创建用户对话框状态
    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newUser, setNewUser] = useState({
        email: "",
        password: "",
        name: "",
        role: "user" as "user" | "admin",
    });

    useEffect(() => {
        fetchUsers();
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            const data = await apiClient.get<AppConfig>("/api/settings");
            setAllowRegistration(data.allowRegistration !== false);
        } catch (error) {
            console.error("Failed to fetch config", error);
        }
    };

    const handleToggleRegistration = async (checked: boolean) => {
        setSavingRegistration(true);
        try {
            await apiClient.post("/api/settings", { allowRegistration: checked });
            setAllowRegistration(checked);
        } catch (error) {
            console.error("Failed to update registration setting", error);
            alert(t.common.error);
        } finally {
            setSavingRegistration(false);
        }
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await apiClient.get<AdminUser[]>("/api/admin/users");
            setUsers(data);
        } catch (error) {
            console.error("Failed to fetch users", error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleStatus = async (user: AdminUser) => {
        const confirmMsg = user.isActive
            ? t.admin.confirmDisable
            : t.admin.confirmEnable;

        if (!confirm(confirmMsg)) return;

        try {
            await apiClient.patch(`/api/admin/users/${user.id}`, { isActive: !user.isActive });
            fetchUsers();
        } catch (error) {
            console.error("Failed to update user status", error);
            alert(t.common.error);
        }
    };

    const handleDelete = async (user: AdminUser) => {
        if (!confirm(t.admin.confirmDelete)) return;

        try {
            await apiClient.delete(`/api/admin/users/${user.id}`);
            fetchUsers();
        } catch (error: any) {
            console.error("Failed to delete user", error);
            const text = error.data?.message || t.common.error;
            alert(text);
        }
    };

    const handleCreateUser = async () => {
        if (!newUser.email || !newUser.password) {
            alert(t.admin.createUser?.emailRequired || "Email and password are required");
            return;
        }

        if (newUser.password.length < 6) {
            alert(t.admin.createUser?.passwordTooShort || "Password must be at least 6 characters");
            return;
        }

        setCreating(true);
        try {
            await apiClient.post("/api/admin/users", newUser);
            setCreateDialogOpen(false);
            setNewUser({ email: "", password: "", name: "", role: "user" });
            fetchUsers();
        } catch (error: any) {
            console.error("Failed to create user", error);
            const text = error.data?.message || t.common.error;
            alert(text);
        } finally {
            setCreating(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <div className="space-y-4">
            {/* 注册开关和添加用户按钮 */}
            <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                    <div className="space-y-0.5">
                        <Label className="text-base">
                            {t.admin?.allowRegistration || "Allow New Registrations"}
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {t.admin?.allowRegistrationDesc || "When disabled, new users cannot register"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {savingRegistration && <Loader2 className="h-4 w-4 animate-spin" />}
                        <Switch
                            checked={allowRegistration}
                            onCheckedChange={handleToggleRegistration}
                            disabled={savingRegistration}
                        />
                    </div>
                </div>

                {/* 添加用户按钮 */}
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="sm:self-center">
                            <UserPlus className="h-4 w-4 mr-2" />
                            {t.admin?.createUser?.button || "Add User"}
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t.admin?.createUser?.title || "Create New User"}</DialogTitle>
                            <DialogDescription>
                                {t.admin?.createUser?.desc || "Create a new user account manually"}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">{t.auth?.email || "Email"} *</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="user@example.com"
                                    value={newUser.email}
                                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="password">{t.auth?.password || "Password"} *</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder={t.admin?.createUser?.passwordPlaceholder || "At least 6 characters"}
                                    value={newUser.password}
                                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="name">{t.auth?.name || "Name"}</Label>
                                <Input
                                    id="name"
                                    placeholder={t.admin?.createUser?.namePlaceholder || "Optional"}
                                    value={newUser.name}
                                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">{t.admin?.role || "Role"}</Label>
                                <Select
                                    value={newUser.role}
                                    onValueChange={(value: "user" | "admin") => setNewUser({ ...newUser, role: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="user">{t.admin?.user || "User"}</SelectItem>
                                        <SelectItem value="admin">{t.admin?.admin || "Admin"}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                                {t.common?.cancel || "Cancel"}
                            </Button>
                            <Button onClick={handleCreateUser} disabled={creating}>
                                {creating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                {t.admin?.createUser?.submit || "Create"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* 移动端卡片视图 */}
            <div className="sm:hidden space-y-3">
                {users.map((user) => (
                    <div key={user.id} className="border rounded-lg p-4 bg-card space-y-3">
                        <div className="flex justify-between items-start">
                            <div>
                                <div className="font-medium">{user.name || "N/A"}</div>
                                <div className="text-sm text-muted-foreground">{user.email}</div>
                            </div>
                            <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                                {user.role === "admin" ? t.admin.admin : t.admin.user}
                            </Badge>
                        </div>
                        <div className="flex justify-between text-sm">
                            <div className="text-muted-foreground">
                                {t.admin.errors}: {user._count.errorItems} | {t.admin.practiceCount}: {user._count.practiceRecords}
                            </div>
                            <Badge variant={user.isActive ? "default" : "destructive"} className="text-xs">
                                {user.isActive ? t.admin.active : t.admin.disabled}
                            </Badge>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t">
                            <div className="text-xs text-muted-foreground">
                                {new Date(user.createdAt).toLocaleDateString()}
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleStatus(user)}
                                    disabled={user.id === (session?.user as any).id}
                                >
                                    {user.isActive ? (
                                        <Ban className="h-4 w-4 text-orange-500" />
                                    ) : (
                                        <CheckCircle className="h-4 w-4 text-green-500" />
                                    )}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(user)}
                                    disabled={user.id === (session?.user as any).id}
                                >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* 桌面端表格视图 */}
            <div className="hidden sm:block border rounded-lg overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t.admin.nameEmail}</TableHead>
                            <TableHead>{t.admin.role}</TableHead>
                            <TableHead>{t.admin.stats}</TableHead>
                            <TableHead>{t.admin.createdAt}</TableHead>
                            <TableHead>{t.admin.status}</TableHead>
                            <TableHead className="text-right">{t.admin.actions}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.id}>
                                <TableCell>
                                    <div className="font-medium">{user.name || "N/A"}</div>
                                    <div className="text-sm text-muted-foreground">{user.email}</div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                                        {user.role === "admin" ? t.admin.admin : t.admin.user}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <div className="text-sm">
                                        {t.admin.errors}: {user._count.errorItems}
                                    </div>
                                    <div className="text-sm">
                                        {t.admin.practiceCount}: {user._count.practiceRecords}
                                    </div>
                                </TableCell>
                                <TableCell>
                                    {new Date(user.createdAt).toLocaleDateString()}
                                </TableCell>
                                <TableCell>
                                    <Badge variant={user.isActive ? "default" : "destructive"}>
                                        {user.isActive ? t.admin.active : t.admin.disabled}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right space-x-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleToggleStatus(user)}
                                        disabled={user.id === (session?.user as any).id}
                                        title={user.isActive ? t.admin.disable : t.admin.enable}
                                    >
                                        {user.isActive ? (
                                            <Ban className="h-4 w-4 text-orange-500" />
                                        ) : (
                                            <CheckCircle className="h-4 w-4 text-green-500" />
                                        )}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDelete(user)}
                                        disabled={user.id === (session?.user as any).id}
                                        title={t.admin.delete}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
