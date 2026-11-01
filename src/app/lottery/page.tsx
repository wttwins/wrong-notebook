"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient, ApiError } from "@/lib/api-client";
import { Wheel, WheelItem } from "@/components/lottery/wheel";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/ui/back-button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Gift, Loader2, Package } from "lucide-react";

interface LotteryStatus {
    enabled: boolean;
    drawsPerDay: number;
    drawsUsedToday: number;
    drawsLeft: number;   // -1 表示不限
    canDraw: boolean;
    reason?: string;
    prizeCount: number;
}

interface PrizeItem {
    id: string;
    name: string;
    description: string | null;
    imagePath: string | null;
    hasImage: boolean;
    stock: number | null;
    soldOut: boolean;
}

interface DrawRecordItem {
    id: string;
    prizeId: string;
    prizeName: string;
    imagePath: string | null;
    createdAt: string;
}

interface DrawResult {
    id: string;
    name: string;
    description: string | null;
    imagePath: string | null;
    isBlank: boolean;
    stockLeft: number | null;
}

/** 转盘动画时长（毫秒）。结果先拿到，动画是"演出时间"，可固定。 */
const SPIN_MS = 4200;
const FULL_TURNS = 6;

export default function LotteryPage() {
    const { t } = useLanguage();
    const L = t.lottery;

    const [status, setStatus] = useState<LotteryStatus | null>(null);
    const [wheelItems, setWheelItems] = useState<WheelItem[]>([]);
    const [prizes, setPrizes] = useState<PrizeItem[]>([]);
    const [records, setRecords] = useState<DrawRecordItem[]>([]);
    const [loading, setLoading] = useState(true);

    const [rotation, setRotation] = useState(0);
    const rotationRef = useRef(0);
    const [spinDuration, setSpinDuration] = useState(0);
    const [spinning, setSpinning] = useState(false);

    const [result, setResult] = useState<DrawResult | null>(null);
    const [showResult, setShowResult] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 转盘布局变化时把角度归零，否则指针会指向错误的扇区
    const wheelKey = wheelItems.map((i) => i.id).join(",");
    useEffect(() => {
        rotationRef.current = 0;
        setSpinDuration(0);
        setRotation(0);
    }, [wheelKey]);

    const loadAll = useCallback(async () => {
        try {
            const [s, w, p, r] = await Promise.all([
                apiClient.get<LotteryStatus>('/api/lottery/status'),
                apiClient.get<{ wheel: WheelItem[] }>('/api/lottery/wheel'),
                apiClient.get<{ prizes: PrizeItem[] }>('/api/lottery/prizes'),
                apiClient.get<{ records: DrawRecordItem[] }>('/api/lottery/records', { params: { limit: '12' } }),
            ]);
            setStatus(s);
            setWheelItems(w.wheel);
            setPrizes(p.prizes);
            setRecords(r.records);
            setError(null);
        } catch {
            setError(L.drawFailed);
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        void loadAll();
    }, [loadAll]);

    /** 计算让第 index 个扇区停在指针（正上方）所需的旋转增量 */
    const computeDelta = (index: number): number => {
        const totalWeight = wheelItems.reduce((s, i) => s + Math.max(1, i.weight), 0);
        if (totalWeight <= 0 || wheelItems.length === 0) return 0;

        // 与 canvas 绘制保持一致：从正上方开始，顺时针切分
        let start = -Math.PI / 2;
        let targetMid = 0;
        let targetSweep = 0;
        for (let i = 0; i < wheelItems.length; i++) {
            const sweep = (Math.max(1, wheelItems[i].weight) / totalWeight) * Math.PI * 2;
            if (i === index) {
                targetMid = start + sweep / 2;
                targetSweep = sweep;
                break;
            }
            start += sweep;
        }

        // 落点加一点随机偏移，避免每次都停在正中间
        const jitter = (Math.random() - 0.5) * targetSweep * 0.6;
        const desired = targetMid + jitter;

        const TWO_PI = Math.PI * 2;
        const current = rotationRef.current;

        // 求最小正增量 Δ，使 (current + Δ) ≡ -π/2 - desired (mod 2π)
        const target = ((-Math.PI / 2 - desired) % TWO_PI + TWO_PI) % TWO_PI;
        let delta = ((target - current) % TWO_PI + TWO_PI) % TWO_PI;

        delta += TWO_PI * FULL_TURNS;
        return delta;
    };

    const handleSpin = async () => {
        if (spinning || !status?.canDraw) return;

        setSpinning(true);
        setError(null);

        try {
            // 关键：结果由服务端决定，动画只是把它「演」出来
            const res = await apiClient.post<{
                prize: DrawResult;
                drawsLeft: number;
                drawsUsedToday: number;
            }>('/api/lottery/draw', {});

            const idx = wheelItems.findIndex((i) => i.id === res.prize.id);

            if (idx >= 0) {
                const delta = computeDelta(idx);
                const next = rotationRef.current + delta;
                rotationRef.current = next;
                setSpinDuration(SPIN_MS);
                setRotation(next);
                setResult(res.prize);
            } else {
                // 布局刚被刷新（例如奖品刚好被抽完），无法定位扇区：直接出结果
                setSpinning(false);
                setResult(res.prize);
                setShowResult(true);
                await loadAll();
            }
        } catch (e) {
            setSpinning(false);
            const msg = e instanceof ApiError && typeof e.data === 'object' && e.data && 'error' in e.data
                ? String((e.data as { error?: string }).error)
                : L.drawFailed;
            setError(msg);
        }
    };

    /** 动画结束：弹结果，并刷新次数与记录 */
    const handleSpinEnd = async () => {
        setSpinning(false);
        setShowResult(true);
        try {
            const [s, r] = await Promise.all([
                apiClient.get<LotteryStatus>('/api/lottery/status'),
                apiClient.get<{ records: DrawRecordItem[] }>('/api/lottery/records', { params: { limit: '12' } }),
            ]);
            setStatus(s);
            setRecords(r.records);
        } catch {
            /* 刷新失败不影响结果展示 */
        }
    };

    /** 关闭结果弹窗时重取布局：可能已有奖品被抽完，扇区需要重画 */
    const handleCloseResult = async () => {
        setShowResult(false);
        await loadAll();
    };

    const drawsLabel = (() => {
        if (!status) return '';
        if (!status.enabled) return L.disabled;
        if (status.drawsPerDay === 0) return L.drawsUnlimited;
        if (status.drawsLeft <= 0) return L.drawsUsedUp;
        return L.drawsLeft.replace('{n}', String(status.drawsLeft));
    })();

    const hasWheel = wheelItems.length > 0;
    const canSpin = !!status?.canDraw && hasWheel && !spinning;

    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-3xl px-4 py-6 space-y-6">
                <div className="flex items-center gap-3">
                    <BackButton fallbackUrl="/" />
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Gift className="h-6 w-6 text-primary" />
                            {L.title}
                        </h1>
                        <p className="text-sm text-muted-foreground">{L.subtitle}</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-16">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <>
                        {/* 大转盘 */}
                        <Card>
                            <CardContent className="pt-6 pb-6 flex flex-col items-center gap-5">
                                <div className="text-sm text-muted-foreground">{drawsLabel}</div>

                                {hasWheel ? (
                                    <Wheel
                                        items={wheelItems}
                                        rotation={rotation}
                                        duration={spinDuration}
                                        spinning={spinning}
                                        onSpinEnd={handleSpinEnd}
                                    >
                                        <button
                                            type="button"
                                            onClick={handleSpin}
                                            disabled={!canSpin}
                                            className="h-full w-full rounded-full flex flex-col items-center justify-center gap-1 disabled:opacity-60 active:scale-95 transition-transform"
                                            style={{
                                                background: canSpin
                                                    ? 'linear-gradient(160deg, #fff5e0, #ffe0a3)'
                                                    : '#f3f4f6',
                                            }}
                                        >
                                            {spinning ? (
                                                <Loader2 className="h-7 w-7 animate-spin text-amber-600" />
                                            ) : (
                                                <>
                                                    <Gift className="h-6 w-6 text-amber-600" />
                                                    <span className="text-sm font-bold text-amber-800">
                                                        {L.drawButton}
                                                    </span>
                                                </>
                                            )}
                                        </button>
                                    </Wheel>
                                ) : (
                                    <p className="text-sm text-muted-foreground py-10">{L.noPrizes}</p>
                                )}

                                {status?.reason === 'lottery_disabled' && (
                                    <p className="text-sm text-muted-foreground">{L.disabled}</p>
                                )}
                                {status?.reason === 'daily_limit_reached' && (
                                    <p className="text-sm text-muted-foreground">{L.drawsUsedUp}</p>
                                )}
                                {error && <p className="text-sm text-destructive">{error}</p>}
                            </CardContent>
                        </Card>

                        {/* 奖品墙 */}
                        {prizes.length > 0 && (
                            <div className="space-y-3">
                                <h2 className="text-lg font-semibold">{L.prizeWall}</h2>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    {prizes.map((p) => (
                                        <Card key={p.id} className={p.soldOut ? 'opacity-55' : ''}>
                                            <CardContent className="p-0">
                                                <div className="aspect-square w-full overflow-hidden rounded-t-lg bg-muted flex items-center justify-center">
                                                    {p.hasImage ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={`/api/lottery/prizes/${p.id}/image`}
                                                            alt={p.name}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <Package className="h-10 w-10 text-muted-foreground/50" />
                                                    )}
                                                </div>
                                                <div className="p-3 space-y-1">
                                                    <div className="font-medium text-sm leading-snug line-clamp-2">{p.name}</div>
                                                    {p.description && (
                                                        <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>
                                                    )}
                                                    <Badge variant={p.soldOut ? 'secondary' : 'outline'} className="text-xs">
                                                        {p.soldOut
                                                            ? L.soldOut
                                                            : p.stock === null
                                                                ? L.unlimited
                                                                : L.stockLeft.replace('{n}', String(p.stock))}
                                                    </Badge>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 我的中奖记录 */}
                        <div className="space-y-3">
                            <h2 className="text-lg font-semibold">{L.myRecords}</h2>
                            {records.length === 0 ? (
                                <p className="text-sm text-muted-foreground">{L.noRecords}</p>
                            ) : (
                                <div className="space-y-2">
                                    {records.map((r) => (
                                        <Card key={r.id}>
                                            <CardContent className="py-3 flex items-center gap-3">
                                                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted flex items-center justify-center">
                                                    {r.imagePath ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img
                                                            src={`/api/lottery/prizes/${r.prizeId}/image`}
                                                            alt={r.prizeName}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <Gift className="h-5 w-5 text-muted-foreground/60" />
                                                    )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="font-medium text-sm truncate">{r.prizeName}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {new Date(r.createdAt).toLocaleString()}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* 抽奖结果 */}
            <Dialog open={showResult} onOpenChange={(o) => { if (!o) void handleCloseResult(); }}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="text-center">
                            {result?.isBlank ? L.betterLuck : L.congratulations}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex flex-col items-center gap-3 py-2">
                        {result?.imagePath && (
                            <div className="h-40 w-40 overflow-hidden rounded-lg bg-muted">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={`/api/lottery/prizes/${result.id}/image`}
                                    alt={result.name}
                                    className="h-full w-full object-cover"
                                />
                            </div>
                        )}

                        {result?.isBlank ? (
                            // 未中奖时标题已经写了「谢谢参与」，正文不再重复奖品名
                            result?.description && (
                                <p className="text-sm text-muted-foreground text-center">{result.description}</p>
                            )
                        ) : (
                            <>
                                <div className="text-lg font-semibold text-center">{result?.name}</div>
                                {result?.description && (
                                    <p className="text-sm text-muted-foreground text-center">{result.description}</p>
                                )}
                            </>
                        )}

                        <Button className="min-h-11 w-full" onClick={() => void handleCloseResult()}>
                            {L.close}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
