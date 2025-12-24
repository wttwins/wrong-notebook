"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Trash2, Loader2, AlertTriangle, Save, Eye, EyeOff, Languages, User, Bot, Shield, RefreshCw, Plus } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { UserManagement } from "@/components/admin/user-management";
import { apiClient } from "@/lib/api-client";
import { frontendLogger } from "@/lib/frontend-logger";
import { AppConfig, UserProfile, UpdateUserProfileRequest, OpenAIInstance } from "@/types/api";
import { ModelSelector } from "@/components/ui/model-selector";
import { PromptSettings } from "@/components/settings/prompt-settings";

import { MessageSquareText, Info, ExternalLink, Github, ScrollText } from "lucide-react";
import packageJson from "../../package.json";

const MAX_OPENAI_INSTANCES = 10;

// 生成唯一 ID
function generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

interface ProfileFormState {
    name: string;
    email: string;
    educationStage: string;
    enrollmentYear: string | number;
    password: string;
}

export function SettingsDialog() {
    const { data: session } = useSession();
    const { t, language, setLanguage } = useLanguage();
    const [open, setOpen] = useState(false);
    const dialogContentRef = useRef<HTMLDivElement>(null);
    const [clearingPractice, setClearingPractice] = useState(false);
    const [clearingError, setClearingError] = useState(false);
    const [systemResetting, setSystemResetting] = useState(false);
    const [migratingTags, setMigratingTags] = useState(false);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [config, setConfig] = useState<AppConfig>({ aiProvider: 'gemini' });
    // OpenAI 多实例状态
    const [selectedInstanceId, setSelectedInstanceId] = useState<string | undefined>(undefined);

    // Profile State
    const [profile, setProfile] = useState<ProfileFormState>({
        name: "",
        email: "",
        educationStage: "",
        enrollmentYear: "",
        password: ""
    });
    const [confirmPassword, setConfirmPassword] = useState("");
    const [profileLoading, setProfileLoading] = useState(false);
    const [profileSaving, setProfileSaving] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const router = useRouter();

    useEffect(() => {
        if (open) {
            fetchSettings();
            fetchProfile();
        }
    }, [open]);

    const fetchSettings = async () => {
        setLoading(true);
        try {
            const data = await apiClient.get<AppConfig>("/api/settings");
            setConfig(data);
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Failed to fetch settings', { error: error instanceof Error ? error.message : String(error) });
        } finally {
            setLoading(false);
        }
    };

    const fetchProfile = async () => {
        setProfileLoading(true);
        try {
            const data = await apiClient.get<UserProfile>("/api/user");
            setProfile({
                name: data.name || "",
                email: data.email || "",
                educationStage: data.educationStage || "",
                enrollmentYear: data.enrollmentYear || "",
                password: ""
            });
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Failed to fetch profile', { error: error instanceof Error ? error.message : String(error) });
        } finally {
            setProfileLoading(false);
        }
    };

    // 验证 OpenAI 实例必填字段
    const validateOpenAIInstances = (): string | null => {
        if (config.aiProvider !== 'openai') return null;
        const instances = config.openai?.instances || [];
        for (const instance of instances) {
            if (!instance.name?.trim()) {
                return t.settings?.ai?.validationNameRequired || '实例名称不能为空';
            }
            if (!instance.apiKey?.trim()) {
                return t.settings?.ai?.validationApiKeyRequired || 'API Key 不能为空';
            }
            if (!instance.baseUrl?.trim()) {
                return t.settings?.ai?.validationBaseUrlRequired || 'Base URL 不能为空';
            }
            if (!instance.model?.trim()) {
                return t.settings?.ai?.validationModelRequired || '模型名称不能为空';
            }
        }
        return null;
    };

    // 验证 Azure OpenAI 必填字段
    const validateAzureConfig = (): string | null => {
        if (config.aiProvider !== 'azure') return null;
        if (!config.azure?.endpoint?.trim()) {
            return t.settings?.ai?.validationAzureEndpointRequired || 'Azure Endpoint is required';
        }
        if (!config.azure?.deploymentName?.trim()) {
            return t.settings?.ai?.validationAzureDeploymentRequired || 'Deployment Name is required';
        }
        if (!config.azure?.apiKey?.trim()) {
            return t.settings?.ai?.validationApiKeyRequired || 'API Key is required';
        }
        return null;
    };

    const handleSaveSettings = async () => {
        // 验证 OpenAI 实例必填字段
        const openaiValidationError = validateOpenAIInstances();
        if (openaiValidationError) {
            alert(openaiValidationError);
            return;
        }

        // 验证 Azure 必填字段
        const azureValidationError = validateAzureConfig();
        if (azureValidationError) {
            alert(azureValidationError);
            return;
        }

        setSaving(true);
        try {
            await apiClient.post("/api/settings", config);
            alert(t.settings?.messages?.saved || "Settings saved");
            // 保存成功后滚动到顶部，方便关闭对话框
            dialogContentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Failed to save settings', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.messages?.saveFailed || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveProfile = async () => {
        setProfileSaving(true);
        try {
            // 验证密码一致性（如果用户输入了密码）
            if (profile.password && profile.password !== confirmPassword) {
                alert(t.settings?.messages?.passwordMismatch || 'Passwords do not match');
                setProfileSaving(false);
                return;
            }

            const payload: UpdateUserProfileRequest = {
                name: profile.name,
                email: profile.email,
                educationStage: profile.educationStage,
            };

            if (profile.enrollmentYear) {
                payload.enrollmentYear = parseInt(profile.enrollmentYear.toString());
            }

            if (profile.password) {
                payload.password = profile.password;
            }

            await apiClient.patch("/api/user", payload);

            alert(t.settings?.messages?.profileUpdated || "Profile updated");
            setProfile(prev => ({ ...prev, password: "" })); // Clear password field
            setConfirmPassword(""); // Clear confirm password field
            setShowPassword(false);
            setShowConfirmPassword(false);
            window.location.reload(); // Reload to update user name in UI
        } catch (error: any) {
            frontendLogger.error('[SettingsDialog]', 'Failed to update profile', { error: error?.data?.message || error?.message || String(error) });
            const message = error.data?.message || (t.settings?.messages?.updateFailed || "Update failed");
            alert(message);
        } finally {
            setProfileSaving(false);
        }
    };

    const handleClearData = async () => {
        if (!confirm(t.settings?.clearDataConfirm || "Are you sure?")) {
            return;
        }

        setClearingPractice(true);
        try {
            await apiClient.delete("/api/stats/practice/clear");
            alert(t.settings?.clearSuccess || "Success");
            setOpen(false);
            window.location.reload();
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Failed to clear practice data', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.clearError || "Failed");
        } finally {
            setClearingPractice(false);
        }
    };

    const handleClearErrorData = async () => {
        if (!confirm(t.settings?.clearErrorDataConfirm || "Are you sure?")) {
            return;
        }

        setClearingError(true);
        try {
            await apiClient.delete("/api/error-items/clear");
            alert(t.settings?.clearSuccess || "Success");
            setOpen(false);
            window.location.reload();
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Failed to clear error data', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.clearError || "Failed");
        } finally {
            setClearingError(false);
        }
    };

    const handleSystemReset = async () => {
        // Double confirm
        if (!confirm(t.settings?.systemResetConfirm || "WARNING: Deleting ALL data. Undoing is impossible. Are you sure?")) {
            return;
        }

        // Optional triple confirm?
        const userInput = prompt(t.settings?.systemResetPrompt || "Type 'RESET' to confirm system initialization:", "");
        if (userInput !== 'RESET') {
            if (userInput !== null) alert(t.common?.error || "Confirmation failed");
            return;
        }

        setSystemResetting(true);
        try {
            await apiClient.post("/api/admin/system-reset", {});
            alert(t.settings?.clearSuccess || "Success - System Reset Complete");
            setOpen(false);
            window.location.reload();
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'System reset failed', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.clearError || "Failed to reset system");
        } finally {
            setSystemResetting(false);
        }
    };

    const handleMigrateTags = async () => {
        if (!confirm(t.settings?.migrateTagsConfirm || "This will reset system tags. Confirm?")) {
            return;
        }

        setMigratingTags(true);
        try {
            const res = await apiClient.post("/api/admin/migrate-tags", {});
            alert(`${t.settings?.clearSuccess || "Success"}: ${(res as any).count || 0} tags migrated.`);
            // No reload needed necessarily, but good to refresh if user is viewing tags.
        } catch (error) {
            frontendLogger.error('[SettingsDialog]', 'Tag migration failed', { error: error instanceof Error ? error.message : String(error) });
            alert(t.settings?.clearError || "Failed to migrate tags");
        } finally {
            setMigratingTags(false);
        }
    };

    const updateConfig = (section: 'openai' | 'gemini', key: string, value: string) => {
        if (section === 'gemini') {
            setConfig(prev => ({
                ...prev,
                gemini: {
                    ...prev.gemini,
                    [key]: value
                }
            }));
        }
        // OpenAI 配置更新通过 updateOpenAIInstance 处理
    };

    // 获取当前选中的 OpenAI 实例
    const getSelectedInstance = (): OpenAIInstance | undefined => {
        const instances = config.openai?.instances || [];
        const activeId = selectedInstanceId || config.openai?.activeInstanceId;
        return instances.find(i => i.id === activeId);
    };

    // 更新当前选中的 OpenAI 实例属性
    const updateOpenAIInstance = (key: keyof OpenAIInstance, value: string) => {
        const instances = config.openai?.instances || [];
        const activeId = selectedInstanceId || config.openai?.activeInstanceId;
        const updatedInstances = instances.map(instance =>
            instance.id === activeId ? { ...instance, [key]: value } : instance
        );
        setConfig(prev => ({
            ...prev,
            openai: {
                ...prev.openai,
                instances: updatedInstances,
            }
        }));
    };

    // 添加新的 OpenAI 实例
    const addOpenAIInstance = () => {
        const instances = config.openai?.instances || [];
        if (instances.length >= MAX_OPENAI_INSTANCES) return;

        const newInstance: OpenAIInstance = {
            id: generateId(),
            name: `Instance ${instances.length + 1}`,
            apiKey: '',
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o',
        };

        setConfig(prev => ({
            ...prev,
            openai: {
                instances: [...(prev.openai?.instances || []), newInstance],
                activeInstanceId: newInstance.id,
            }
        }));
        setSelectedInstanceId(newInstance.id);
    };

    // 删除 OpenAI 实例
    const deleteOpenAIInstance = (instanceId: string) => {
        const instances = config.openai?.instances || [];
        const updatedInstances = instances.filter(i => i.id !== instanceId);
        const newActiveId = updatedInstances.length > 0 ? updatedInstances[0].id : undefined;

        setConfig(prev => ({
            ...prev,
            openai: {
                instances: updatedInstances,
                activeInstanceId: newActiveId,
            }
        }));
        setSelectedInstanceId(newActiveId);
    };

    // 切换激活的 OpenAI 实例
    const setActiveOpenAIInstance = (instanceId: string) => {
        setSelectedInstanceId(instanceId);
        setConfig(prev => ({
            ...prev,
            openai: {
                ...prev.openai,
                activeInstanceId: instanceId,
            }
        }));
    };

    // 同步 selectedInstanceId 与 config
    useEffect(() => {
        if (config.openai?.activeInstanceId && !selectedInstanceId) {
            setSelectedInstanceId(config.openai.activeInstanceId);
        }
    }, [config.openai?.activeInstanceId, selectedInstanceId]);

    const updatePrompts = (type: 'analyze' | 'similar', value: string) => {
        setConfig(prev => ({
            ...prev,
            prompts: {
                ...prev.prompts,
                [type]: value
            }
        }));
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                    <Settings className="h-5 w-5" />
                    <span className="sr-only">{t.settings?.title || "Settings"}</span>
                </Button>
            </DialogTrigger>
            <DialogContent ref={dialogContentRef} className="w-[calc(100vw-2rem)] sm:max-w-[900px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t.settings?.title || "Settings"}</DialogTitle>
                    <DialogDescription>
                        {t.settings?.desc || 'Manage your preferences and data.'}
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="general" className="w-full">
                    <TabsList className={`grid w-full grid-cols-3 sm:grid-cols-6 ${(session?.user as any)?.role === 'admin' ? 'sm:grid-cols-7' : ''} gap-1 h-auto`}>
                        <TabsTrigger value="general" className="px-2 sm:px-3">
                            <Languages className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">{t.settings?.tabs?.general || "General"}</span>
                        </TabsTrigger>
                        <TabsTrigger value="account" className="px-2 sm:px-3">
                            <User className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">{t.settings?.tabs?.account || "Account"}</span>
                        </TabsTrigger>
                        <TabsTrigger value="ai" className="px-2 sm:px-3">
                            <Bot className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">{t.settings?.tabs?.ai || "AI Provider"}</span>
                        </TabsTrigger>
                        <TabsTrigger value="prompts" className="px-2 sm:px-3">
                            <MessageSquareText className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">{t.settings?.tabs?.prompts || "Prompts"}</span>
                        </TabsTrigger>
                        {(session?.user as any)?.role === 'admin' && (
                            <TabsTrigger value="admin" className="px-2 sm:px-3">
                                <Shield className="h-4 w-4 sm:mr-2" />
                                <span className="hidden sm:inline">{t.settings?.tabs?.admin || "User Management"}</span>
                            </TabsTrigger>
                        )}
                        <TabsTrigger value="danger" className="px-2 sm:px-3">
                            <AlertTriangle className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">{t.settings?.tabs?.danger || "Danger"}</span>
                        </TabsTrigger>
                        <TabsTrigger value="about" className="px-2 sm:px-3">
                            <Info className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">{t.settings?.tabs?.about || "About"}</span>
                        </TabsTrigger>
                    </TabsList>

                    {/* General Tab */}
                    <TabsContent value="general" className="space-y-4 py-4">
                        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                            <div className="space-y-2">
                                <Label>{t.settings?.language || "Language"}</Label>
                                <Select
                                    value={language}
                                    onValueChange={(val: 'zh' | 'en') => setLanguage(val)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="zh">中文 (Chinese)</SelectItem>
                                        <SelectItem value="en">English</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </TabsContent>

                    {/* Account Tab */}
                    <TabsContent value="account" className="space-y-4 py-4">
                        {profileLoading ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>{t.auth?.name || "Name"}</Label>
                                        <Input
                                            value={profile.name || ""}
                                            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{t.auth?.email || "Email"}</Label>
                                        <Input
                                            value={profile.email || ""}
                                            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                                            type="email"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>{t.auth?.educationStage || "Education Stage"}</Label>
                                        <Select
                                            value={profile.educationStage || ""}
                                            onValueChange={(val) => setProfile({ ...profile, educationStage: val })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder={t.auth?.selectStage || "Select Stage"} />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="primary">{t.auth?.primary || 'Primary School'}</SelectItem>
                                                <SelectItem value="junior_high">{t.auth?.juniorHigh || 'Junior High'}</SelectItem>
                                                <SelectItem value="senior_high">{t.auth?.seniorHigh || 'Senior High'}</SelectItem>
                                                <SelectItem value="university">{t.auth?.university || 'University'}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{t.auth?.enrollmentYear || "Enrollment Year"}</Label>
                                        <Input
                                            type="number"
                                            value={profile.enrollmentYear || ""}
                                            onChange={(e) => setProfile({ ...profile, enrollmentYear: e.target.value })}
                                            placeholder="YYYY"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3 pt-2 border-t">
                                    <div className="space-y-2">
                                        <Label>{t.settings?.account?.changePassword || "Change Password (Leave empty to keep)"}</Label>
                                        <div className="relative">
                                            <Input
                                                type={showPassword ? "text" : "password"}
                                                value={profile.password}
                                                onChange={(e) => setProfile({ ...profile, password: e.target.value })}
                                                placeholder="******"
                                                minLength={6}
                                                className="pr-10"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                onClick={() => setShowPassword(!showPassword)}
                                                tabIndex={-1}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                    {profile.password && (
                                        <div className="space-y-2">
                                            <Label>{t.auth?.confirmPassword || "Confirm Password"}</Label>
                                            <div className="relative">
                                                <Input
                                                    type={showConfirmPassword ? "text" : "password"}
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    placeholder="******"
                                                    minLength={6}
                                                    className="pr-10"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                    tabIndex={-1}
                                                >
                                                    {showConfirmPassword ? (
                                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <Button onClick={handleSaveProfile} disabled={profileSaving} className="w-full">
                                    {profileSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {t.settings?.account?.update || "Update Profile"}
                                </Button>
                            </div>
                        )}
                    </TabsContent>

                    {/* AI Tab */}
                    <TabsContent value="ai" className="space-y-4 py-4">
                        {loading ? (
                            <div className="flex justify-center py-4">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                                <div className="space-y-2">
                                    <Label>{t.settings?.tabs?.ai || "AI Provider"}</Label>
                                    <Select
                                        value={config.aiProvider}
                                        onValueChange={(val: 'gemini' | 'openai' | 'azure') => setConfig(prev => ({ ...prev, aiProvider: val }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="gemini">Google Gemini</SelectItem>
                                            <SelectItem value="openai">OpenAI / Compatible</SelectItem>
                                            <SelectItem value="azure">Azure OpenAI</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {config.aiProvider === 'openai' && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                        {/* 实例选择器 */}
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label>{t.settings?.ai?.instances || "Instance"}</Label>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={addOpenAIInstance}
                                                    disabled={(config.openai?.instances?.length || 0) >= MAX_OPENAI_INSTANCES}
                                                    className="h-7 px-2 text-xs"
                                                >
                                                    <Plus className="h-3 w-3 mr-1" />
                                                    {t.settings?.ai?.addInstance || "Add"}
                                                </Button>
                                            </div>
                                            {(config.openai?.instances?.length || 0) > 0 ? (
                                                <div className="flex gap-2">
                                                    <Select
                                                        value={selectedInstanceId || config.openai?.activeInstanceId || ''}
                                                        onValueChange={setActiveOpenAIInstance}
                                                    >
                                                        <SelectTrigger className="flex-1">
                                                            <SelectValue placeholder={t.settings?.ai?.selectInstance || "Select Instance"} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {(config.openai?.instances || []).map((instance) => (
                                                                <SelectItem key={instance.id} value={instance.id}>
                                                                    {instance.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    {(config.openai?.instances?.length || 0) > 1 && (
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon"
                                                            onClick={() => {
                                                                const activeId = selectedInstanceId || config.openai?.activeInstanceId;
                                                                if (activeId && confirm(t.settings?.ai?.confirmDelete || 'Delete this instance?')) {
                                                                    deleteOpenAIInstance(activeId);
                                                                }
                                                            }}
                                                            className="h-10 w-10 text-destructive hover:text-destructive"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-sm text-muted-foreground">
                                                    {t.settings?.ai?.noInstances || "No instances configured. Click 'Add' to create one."}
                                                </p>
                                            )}
                                            {(config.openai?.instances?.length || 0) >= MAX_OPENAI_INSTANCES && (
                                                <p className="text-xs text-amber-600">
                                                    {t.settings?.ai?.maxInstancesReached || "Maximum instances reached (10)"}
                                                </p>
                                            )}
                                        </div>

                                        {/* 实例配置表单 */}
                                        {getSelectedInstance() && (
                                            <div className="space-y-3 p-3 border rounded-md bg-background">
                                                <div className="space-y-2">
                                                    <Label>{t.settings?.ai?.instanceName || "Instance Name"} <span className="text-destructive">*</span></Label>
                                                    <Input
                                                        value={getSelectedInstance()?.name || ''}
                                                        onChange={(e) => updateOpenAIInstance('name', e.target.value)}
                                                        placeholder="e.g. 智谱 GLM-4V"
                                                        className={!getSelectedInstance()?.name?.trim() ? 'border-destructive' : ''}
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>API Key <span className="text-destructive">*</span></Label>
                                                    <div className="relative">
                                                        <Input
                                                            type={showApiKey ? "text" : "password"}
                                                            value={getSelectedInstance()?.apiKey || ''}
                                                            onChange={(e) => updateOpenAIInstance('apiKey', e.target.value)}
                                                            placeholder="sk-..."
                                                            className={`pr-10 ${!getSelectedInstance()?.apiKey?.trim() ? 'border-destructive' : ''}`}
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                            onClick={() => setShowApiKey(!showApiKey)}
                                                        >
                                                            {showApiKey ? (
                                                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                            ) : (
                                                                <Eye className="h-4 w-4 text-muted-foreground" />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>Base URL <span className="text-destructive">*</span></Label>
                                                    <Input
                                                        value={getSelectedInstance()?.baseUrl || ''}
                                                        onChange={(e) => updateOpenAIInstance('baseUrl', e.target.value)}
                                                        placeholder="https://api.openai.com/v1"
                                                        className={!getSelectedInstance()?.baseUrl?.trim() ? 'border-destructive' : ''}
                                                    />
                                                </div>
                                                <ModelSelector
                                                    provider="openai"
                                                    apiKey={getSelectedInstance()?.apiKey}
                                                    baseUrl={getSelectedInstance()?.baseUrl}
                                                    currentModel={getSelectedInstance()?.model}
                                                    onModelChange={(model) => updateOpenAIInstance('model', model)}
                                                />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {config.aiProvider === 'gemini' && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                        <div className="space-y-2">
                                            <Label>API Key</Label>
                                            <div className="relative">
                                                <Input
                                                    type={showApiKey ? "text" : "password"}
                                                    value={config.gemini?.apiKey || ''}
                                                    onChange={(e) => updateConfig('gemini', 'apiKey', e.target.value)}
                                                    placeholder="AIza..."
                                                    className="pr-10"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                    onClick={() => setShowApiKey(!showApiKey)}
                                                >
                                                    {showApiKey ? (
                                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Base URL (Optional)</Label>
                                            <Input
                                                value={config.gemini?.baseUrl || ''}
                                                onChange={(e) => updateConfig('gemini', 'baseUrl', e.target.value)}
                                                placeholder="https://generativelanguage.googleapis.com"
                                            />
                                        </div>
                                        <ModelSelector
                                            provider="gemini"
                                            apiKey={config.gemini?.apiKey}
                                            baseUrl={config.gemini?.baseUrl}
                                            currentModel={config.gemini?.model}
                                            onModelChange={(model) => updateConfig('gemini', 'model', model)}
                                        />
                                    </div>
                                )}

                                {config.aiProvider === 'azure' && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                        <div className="space-y-2">
                                            <Label>{t.settings?.ai?.azureEndpoint || "Azure Endpoint"} <span className="text-destructive">*</span></Label>
                                            <Input
                                                value={config.azure?.endpoint || ''}
                                                onChange={(e) => setConfig(prev => ({ ...prev, azure: { ...prev.azure, endpoint: e.target.value } }))}
                                                placeholder={t.settings?.ai?.azureEndpointPlaceholder || "https://your-resource.openai.azure.com"}
                                                className={!config.azure?.endpoint?.trim() ? 'border-destructive' : ''}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t.settings?.ai?.azureDeployment || "Deployment Name"} <span className="text-destructive">*</span></Label>
                                            <Input
                                                value={config.azure?.deploymentName || ''}
                                                onChange={(e) => setConfig(prev => ({ ...prev, azure: { ...prev.azure, deploymentName: e.target.value } }))}
                                                placeholder={t.settings?.ai?.azureDeploymentPlaceholder || "gpt-4o-deployment"}
                                                className={!config.azure?.deploymentName?.trim() ? 'border-destructive' : ''}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>API Key <span className="text-destructive">*</span></Label>
                                            <div className="relative">
                                                <Input
                                                    type={showApiKey ? "text" : "password"}
                                                    value={config.azure?.apiKey || ''}
                                                    onChange={(e) => setConfig(prev => ({ ...prev, azure: { ...prev.azure, apiKey: e.target.value } }))}
                                                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                                                    className={`pr-10 ${!config.azure?.apiKey?.trim() ? 'border-destructive' : ''}`}
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                    onClick={() => setShowApiKey(!showApiKey)}
                                                >
                                                    {showApiKey ? (
                                                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                    ) : (
                                                        <Eye className="h-4 w-4 text-muted-foreground" />
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t.settings?.ai?.azureApiVersion || "API Version"}</Label>
                                            <Input
                                                value={config.azure?.apiVersion || ''}
                                                onChange={(e) => setConfig(prev => ({ ...prev, azure: { ...prev.azure, apiVersion: e.target.value } }))}
                                                placeholder={t.settings?.ai?.azureApiVersionPlaceholder || "2024-02-15-preview"}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t.settings?.ai?.azureModel || "Model Display Name"}</Label>
                                            <Input
                                                value={config.azure?.model || ''}
                                                onChange={(e) => setConfig(prev => ({ ...prev, azure: { ...prev.azure, model: e.target.value } }))}
                                                placeholder="gpt-4o"
                                            />
                                        </div>
                                    </div>
                                )}

                                <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {t.settings?.ai?.save || "Save AI Settings"}
                                </Button>
                            </div>
                        )}
                    </TabsContent>

                    {/* Prompts Tab */}
                    <TabsContent value="prompts" className="space-y-4 py-4">
                        <PromptSettings config={config} onUpdate={updatePrompts} />
                        <Button onClick={handleSaveSettings} disabled={saving} className="w-full">
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t.settings?.prompts?.save || "Save Prompt Settings"}
                        </Button>
                    </TabsContent>

                    {/* Admin Tab */}
                    {(session?.user as any)?.role === 'admin' && (
                        <TabsContent value="admin" className="space-y-4 py-4">
                            <UserManagement />
                        </TabsContent>
                    )}

                    {/* Danger Zone Tab */}
                    <TabsContent value="danger" className="space-y-4 py-4">
                        <div className="space-y-3">
                            {/* Clear Practice Data */}
                            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-red-700 font-medium">
                                        {t.settings?.clearData || "Clear Practice Data"}
                                    </span>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={handleClearData}
                                        disabled={clearingPractice}
                                    >
                                        {clearingPractice ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                                <p className="text-xs text-red-600 mt-2">
                                    {t.settings?.clearDataDesc || 'This will permanently delete all practice history. Irreversible.'}
                                </p>
                            </div>

                            {/* Clear Error Data */}
                            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-red-700 font-medium">
                                        {t.settings?.clearErrorData || "Clear Error Data"}
                                    </span>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={handleClearErrorData}
                                        disabled={clearingError}
                                    >
                                        {clearingError ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="h-4 w-4" />
                                        )}
                                    </Button>
                                </div>
                                <p className="text-xs text-red-600 mt-2">
                                    {t.settings?.clearErrorDataDesc || 'This will permanently delete all error items. Irreversible.'}
                                </p>
                            </div>

                            {/* System Reset & Migration (Admin Only) */}
                            {(session?.user as any)?.role === 'admin' && (
                                <>
                                    {/* Migrate Tags */}
                                    <div className="p-4 border border-blue-200 rounded-lg bg-blue-50 mb-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-sm text-blue-900 font-bold flex items-center gap-2">
                                                    <RefreshCw className="h-4 w-4" />
                                                    {t.settings?.migrateTags || "Migrate Tags"}
                                                </span>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={handleMigrateTags}
                                                disabled={migratingTags}
                                                className="bg-blue-100 hover:bg-blue-200 text-blue-900 border-blue-300"
                                            >
                                                {migratingTags ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <RefreshCw className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                        <p className="text-xs text-blue-800 mt-2 font-medium">
                                            {t.settings?.migrateTagsDesc || 'Re-populates standard tags from file'}
                                        </p>
                                    </div>

                                    {/* System Reset */}
                                    <div className="p-4 border border-red-600/50 rounded-lg bg-red-100/50">
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-sm text-red-900 font-bold flex items-center gap-2">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    {t.settings?.systemReset || "System Initialization"}
                                                </span>
                                            </div>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={handleSystemReset}
                                                disabled={systemResetting}
                                                className="bg-red-700 hover:bg-red-800"
                                            >
                                                {systemResetting ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                        <p className="text-xs text-red-800 mt-2 font-medium">
                                            {t.settings?.systemResetDesc || 'Resets the system to factory state. Deletes ALL data.'}
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    </TabsContent>

                    {/* About Tab */}
                    <TabsContent value="about" className="space-y-4 py-4">
                        <div className="flex flex-col items-center justify-center space-y-6 py-8 text-center bg-muted/30 rounded-lg border">
                            <div className="space-y-2">
                                <h3 className="text-2xl font-bold">{t.app?.title || "Smart Error Notebook"}</h3>
                                <p className="text-muted-foreground">
                                    {t.settings?.about?.desc || "AI-powered learning assistant"}
                                </p>
                            </div>

                            <div className="flex items-center space-x-2 text-sm text-muted-foreground border px-4 py-2 rounded-full bg-background">
                                <Info className="h-4 w-4" />
                                <span>{t.settings?.about?.version || "Version"}: v{packageJson.version}</span>
                            </div>

                            <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-4 w-full sm:w-auto px-4 sm:px-0">
                                <Button variant="outline" asChild className="gap-2 w-full sm:w-auto">
                                    <a href="https://github.com/wttwins/wrong-notebook" target="_blank" rel="noopener noreferrer">
                                        <Github className="h-4 w-4" />
                                        {t.settings?.about?.github || "GitHub Repository"}
                                        <ExternalLink className="h-3 w-3 ml-1 opacity-50" />
                                    </a>
                                </Button>

                                <Button variant="outline" asChild className="gap-2 w-full sm:w-auto">
                                    <a href="https://github.com/wttwins/wrong-notebook/releases" target="_blank" rel="noopener noreferrer">
                                        <ScrollText className="h-4 w-4" />
                                        {t.settings?.about?.releaseNotes || "Release Notes"}
                                        <ExternalLink className="h-3 w-3 ml-1 opacity-50" />
                                    </a>
                                </Button>

                                <Button variant="outline" asChild className="gap-2 w-full sm:w-auto">
                                    <a href="https://github.com/wttwins/wrong-notebook/issues" target="_blank" rel="noopener noreferrer">
                                        <MessageSquareText className="h-4 w-4" />
                                        {t.settings?.about?.feedback || "Feedback"}
                                        <ExternalLink className="h-3 w-3 ml-1 opacity-50" />
                                    </a>
                                </Button>
                            </div>

                            <p className="text-xs text-muted-foreground mt-8">
                                {t.settings?.about?.copyright || "© 2025 Wttwins. All rights reserved."}
                            </p>
                        </div>
                    </TabsContent>

                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
