"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient, ApiError } from "@/lib/api-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Gift, Loader2, Pencil, Plus, Trash2, Upload, X } from "lucide-react";

interface AdminPrize {
    id: string;
    name: string;
    description: string | null;
    imagePath: string | null;
    hasImage: boolean;
    weight: number;
    probability: number;
    stock: number | null;
    enabled: boolean;
    isBlank: boolean;
    sortOrder: number;
    drawCount: number;
}

interface DrawRecordRow {
    id: string;
    prizeName: string;
    imagePath: string | null;
    createdAt: string;
    userEmail: string;
    userName: string | null;
}

interface LotteryConfig {
    enabled: boolean;
    drawsPerDay: number;
}

interface PrizeForm {
    id?: string;
    name: string;
    description: string;
    weight: number;
    stock: string;       // 空字符串 = 不限量
    enabled: boolean;
    isBlank: boolean;
    sortOrder: number;
    imageDataUrl?: string | null;
    removeImage?: boolean;
}

const EMPTY_FORM: PrizeForm = {
    name: '',
    description: '',
    weight: 10,
    stock: '',
    enabled: true,
    isBlank: false,
    sortOrder: 0,
};

// 图片上限 2MB，与服务端保持一致
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export default function AdminLotteryPage() {
    const { t } = useLanguage();
    const LT = t.lottery;
    const L = t.lottery.admin;
    const { data: session, status: sessionStatus } = useSession();
    const router = useRouter();

    const [config, setConfig] = useState<LotteryConfig | null>(null);
    const [prizes, setPrizes] = useState<AdminPrize[]>([]);
    const [records, setRecords] = useState<DrawRecordRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [form, setForm] = useState<PrizeForm>(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    // 非管理员直接踢回首页
    useEffect(() => {
        if (sessionStatus === 'unauthenticated') router.push('/login');
        // @ts-ignore
        if (sessionStatus === 'authenticated' && session?.user?.role !== 'admin') router.push('/');
    }, [sessionStatus, session, router]);

    const loadAll = useCallback(async () => {
        try {
            const [cfg, pr, rec] = await Promise.all([
                apiClient.get<LotteryConfig>('/api/admin/lottery/config'),
                apiClient.get<{ prizes: AdminPrize[] }>('/api/admin/prizes'),
                apiClient.get<{ records: DrawRecordRow[] }>('/api/admin/lottery/records', { params: { limit: '50' } }),
            ]);
            setConfig(cfg);
            setPrizes(pr.prizes);
            setRecords(rec.records);
        } catch (e) {
            if (e instanceof ApiError && (e.status === 403 || e.status === 401)) {
                setForbidden(true);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (sessionStatus === 'authenticated') void loadAll();
    }, [sessionStatus, loadAll]);

    const saveConfig = async (patch: Partial<LotteryConfig>) => {
        if (!config) return;
        setSavingConfig(true);
        setMessage(null);
        try {
            const next = await apiClient.patch<LotteryConfig>('/api/admin/lottery/config', patch);
            setConfig(next);
            setMessage('已保存');
            setTimeout(() => setMessage(null), 2000);
        } catch {
            setMessage('保存失败');
        } finally {
            setSavingConfig(false);
        }
    };

    const openCreate = () => {
        setForm({ ...EMPTY_FORM });
        setFormError(null);
        setDialogOpen(true);
    };

    const openEdit = (p: AdminPrize) => {
        setForm({
            id: p.id,
            name: p.name,
            description: p.description ?? '',
            weight: p.weight,
            stock: p.stock === null ? '' : String(p.stock),
            enabled: p.enabled,
            isBlank: p.isBlank,
            sortOrder: p.sortOrder,
            imageDataUrl: null,
            removeImage: false,
        });
        setFormError(null);
        setDialogOpen(true);
    };

    const handlePickImage = (file: File | null) => {
        if (!file) return;
        if (file.size > MAX_IMAGE_BYTES) {
            setFormError(L.imageHint + `（当前 ${(file.size / 1024 / 1024).toFixed(1)}MB）`);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setForm((f) => ({ ...f, imageDataUrl: String(reader.result), removeImage: false }));
            setFormError(null);
        };
        reader.onerror = () => setFormError('读取图片失败');
        reader.readAsDataURL(file);
    };

    const handleSave = async () => {
        if (saving) return;
        if (!form.name.trim()) {
            setFormError('请填写奖品名称');
            return;
        }
        setSaving(true);
        setFormError(null);

        const payload: Record<string, unknown> = {
            name: form.name.trim(),
            description: form.description.trim(),
            weight: Number(form.weight) || 1,
            stock: form.stock === '' ? null : Number(form.stock),
            enabled: form.enabled,
            isBlank: form.isBlank,
            sortOrder: Number(form.sortOrder) || 0,
        };
        if (form.imageDataUrl) payload.imageDataUrl = form.imageDataUrl;
        if (form.removeImage) payload.removeImage = true;

        try {
            if (form.id) {
                await apiClient.patch(`/api/admin/prizes/${form.id}`, payload);
            } else {
                await apiClient.post('/api/admin/prizes', payload);
            }
            setDialogOpen(false);
            await loadAll();
        } catch (e) {
            const msg = e instanceof ApiError && typeof e.data === 'object' && e.data && 'error' in e.data
                ? String((e.data as { error?: string }).error)
                : L.saveFailed;
            setFormError(msg);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (p: AdminPrize) => {
        if (!window.confirm(`${L.deleteConfirm}\n\n${p.name}`)) return;
        try {
            await apiClient.delete(`/api/admin/prizes/${p.id}`);
            await loadAll();
        } catch (e) {
            const msg = e instanceof ApiError && typeof e.data === 'object' && e.data && 'error' in e.data
                ? String((e.data as { error?: string }).error)
                : L.deleteFailed;
            window.alert(msg);
        }
    };

    if (sessionStatus === 'loading' || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (forbidden) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-3">
                <p className="text-muted-foreground">需要管理员权限</p>
                <Button variant="outline" onClick={() => router.push('/admin')}>返回管理后台</Button>
            </div>
        );
    }

    const previewSrc = form.imageDataUrl
        ? form.imageDataUrl
        : (!form.removeImage && form.id
            ? `/api/lottery/prizes/${form.id}/image`
            : null);

    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={() => router.push('/admin')}>
                        <X className="h-5 w-5" />
                    </Button>
                    <div className="flex-1">
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Gift className="h-6 w-6 text-primary" />
                            {L.title}
                        </h1>
                    </div>
                    <Button className="min-h-11" onClick={openCreate}>
                        <Plus className="h-4 w-4 mr-2" />
                        {L.addPrize}
                    </Button>
                </div>

                {/* 规则 */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">{L.rules}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <Label htmlFor="lottery-enabled">{L.enabledLabel}</Label>
                            <Switch
                                id="lottery-enabled"
                                checked={config?.enabled ?? true}
                                disabled={savingConfig}
                                onCheckedChange={(v) => void saveConfig({ enabled: v })}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <Label htmlFor="draws-per-day">{L.drawsPerDay}</Label>
                                <p className="text-xs text-muted-foreground">{L.drawsPerDayHint}</p>
                            </div>
                            <Input
                                id="draws-per-day"
                                type="number"
                                min={0}
                                className="w-24 text-center"
                                defaultValue={config?.drawsPerDay ?? 1}
                                disabled={savingConfig}
                                onBlur={(e) => {
                                    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                                    if (n !== config?.drawsPerDay) void saveConfig({ drawsPerDay: n });
                                }}
                            />
                        </div>
                        {message && <p className="text-sm text-muted-foreground">{message}</p>}
                    </CardContent>
                </Card>

                {/* 奖品 */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">{L.prizes}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {prizes.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4">{L.noPrizes}</p>
                        ) : (
                            <div className="divide-y">
                                {prizes.map((p) => (
                                    <div key={p.id} className="flex items-center gap-3 py-3">
                                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted flex items-center justify-center">
                                            {p.hasImage ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={`/api/lottery/prizes/${p.id}/image`}
                                                    alt={p.name}
                                                    className="h-full w-full object-cover"
                                                />
                                            ) : (
                                                <Gift className="h-5 w-5 text-muted-foreground/50" />
                                            )}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-medium text-sm truncate">{p.name}</span>
                                                {p.isBlank && <Badge variant="secondary" className="text-xs">{L.blankBadge}</Badge>}
                                                {!p.enabled && <Badge variant="outline" className="text-xs">停用</Badge>}
                                            </div>
                                            <div className="text-xs text-muted-foreground mt-0.5">
                                                {L.probability} {p.probability}% ·{' '}
                                                {p.stock === null ? LT.unlimited : `${L.stock} ${p.stock}`} ·{' '}
                                                {L.drawCount} {p.drawCount}
                                            </div>
                                        </div>

                                        <Button variant="ghost" size="icon" className="min-h-11 min-w-11" onClick={() => openEdit(p)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="min-h-11 min-w-11 text-destructive"
                                            onClick={() => void handleDelete(p)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* 抽奖记录 */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">{L.records}</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {records.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-4">暂无记录</p>
                        ) : (
                            <div className="divide-y">
                                {records.map((r) => (
                                    <div key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                                        <div className="min-w-0">
                                            <div className="truncate">{r.prizeName}</div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {r.userName || r.userEmail}
                                            </div>
                                        </div>
                                        <div className="text-xs text-muted-foreground shrink-0">
                                            {new Date(r.createdAt).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* 新增/编辑对话框 */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{form.id ? L.editPrize : L.addPrize}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* 图片 */}
                        <div className="space-y-2">
                            <Label>{L.image}</Label>
                            <div className="flex items-center gap-3">
                                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted flex items-center justify-center">
                                    {previewSrc ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img src={previewSrc} alt="preview" className="h-full w-full object-cover" />
                                    ) : (
                                        <Gift className="h-6 w-6 text-muted-foreground/50" />
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="min-h-11"
                                        onClick={() => fileRef.current?.click()}
                                    >
                                        <Upload className="h-4 w-4 mr-2" />
                                        {L.uploadImage}
                                    </Button>
                                    {previewSrc && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setForm((f) => ({ ...f, imageDataUrl: null, removeImage: true }))}
                                        >
                                            {L.removeImage}
                                        </Button>
                                    )}
                                </div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={(e) => handlePickImage(e.target.files?.[0] ?? null)}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">{L.imageHint}</p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="prize-name">{L.name}</Label>
                            <Input
                                id="prize-name"
                                value={form.name}
                                maxLength={60}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                placeholder="免做一次作业券"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="prize-desc">{L.description}</Label>
                            <Textarea
                                id="prize-desc"
                                value={form.description}
                                maxLength={300}
                                rows={2}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label htmlFor="prize-weight">{L.weight}</Label>
                                <Input
                                    id="prize-weight"
                                    type="number"
                                    min={1}
                                    max={1000}
                                    value={form.weight}
                                    onChange={(e) => setForm((f) => ({ ...f, weight: Number(e.target.value) || 1 }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="prize-stock">{L.stock}</Label>
                                <Input
                                    id="prize-stock"
                                    type="number"
                                    min={0}
                                    value={form.stock}
                                    placeholder={LT.unlimited}
                                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground -mt-2">{L.weightHint}；{L.stockHint}</p>

                        <div className="flex items-center justify-between gap-4">
                            <Label htmlFor="prize-enabled">{L.enabled}</Label>
                            <Switch
                                id="prize-enabled"
                                checked={form.enabled}
                                onCheckedChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
                            />
                        </div>

                        <div className="flex items-center justify-between gap-4">
                            <Label htmlFor="prize-blank" className="text-sm leading-snug">{L.isBlank}</Label>
                            <Switch
                                id="prize-blank"
                                checked={form.isBlank}
                                onCheckedChange={(v) => setForm((f) => ({ ...f, isBlank: v }))}
                            />
                        </div>

                        {formError && <p className="text-sm text-destructive">{formError}</p>}
                    </div>

                    <DialogFooter className="gap-2">
                        <Button variant="outline" className="min-h-11" onClick={() => setDialogOpen(false)}>
                            {L.cancel}
                        </Button>
                        <Button className="min-h-11" disabled={saving} onClick={() => void handleSave()}>
                            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            {saving ? L.saving : L.save}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
