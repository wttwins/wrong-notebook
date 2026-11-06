"use client";

import { useEffect, useRef, useState } from "react";

export interface WheelItem {
    id: string;
    name: string;
    weight: number;
    isBlank: boolean;
    hasImage?: boolean;
}

interface WheelProps {
    items: WheelItem[];
    /** 目标旋转角度（弧度，顺时针为正） */
    rotation: number;
    /** 动画时长（毫秒），0 表示不带动画 */
    duration: number;
    spinning: boolean;
    onSpinEnd?: () => void;
    /** 中心区域，通常放「抽一次」按钮 */
    children?: React.ReactNode;
}

const PRIZE_COLORS = ["#FFF4D9", "#FFE3AE"];
const BLANK_COLORS = ["#EEF1F6", "#E2E7EF"];
const TEXT_PRIZE = "#5B3D0B";
const TEXT_BLANK = "#7B8496";

/** 按可用宽度截断文字并加省略号 */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let lo = 0;
    let hi = text.length;
    while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (ctx.measureText(text.slice(0, mid) + "…").width <= maxWidth) lo = mid;
        else hi = mid - 1;
    }
    return text.slice(0, lo) + "…";
}

export function Wheel({ items, rotation, duration, spinning, onSpinEnd, children }: WheelProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [size, setSize] = useState(320);

    // 尺寸自适应容器（iPad 竖屏 / 桌面都能用）
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const update = () => {
            const w = el.clientWidth;
            // 上限 420，避免大屏上转盘过大
            setSize(Math.max(240, Math.min(420, Math.floor(w))));
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // 绘制扇区（只在数据或尺寸变化时重绘，不参与动画）
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || items.length === 0) return;

        const dpr = Math.min(3, window.devicePixelRatio || 1);
        canvas.width = Math.floor(size * dpr);
        canvas.height = Math.floor(size * dpr);
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);

        const cx = size / 2;
        const cy = size / 2;
        const R = size / 2 - 4;

        const totalWeight = items.reduce((sum, it) => sum + Math.max(1, it.weight), 0);
        const equalSweep = (Math.PI * 2) / items.length;

        let start = -Math.PI / 2; // 从正上方开始，顺时针
        let prizeSeq = 0;
        let blankSeq = 0;

        items.forEach((item) => {
            const sweep = totalWeight > 0
                ? (Math.max(1, item.weight) / totalWeight) * Math.PI * 2
                : equalSweep;

            // —— 扇形底色 ——
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, R, start, start + sweep);
            ctx.closePath();

            if (item.isBlank) {
                ctx.fillStyle = BLANK_COLORS[blankSeq++ % BLANK_COLORS.length];
            } else {
                ctx.fillStyle = PRIZE_COLORS[prizeSeq++ % PRIZE_COLORS.length];
            }
            ctx.fill();

            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 2;
            ctx.stroke();

            // —— 文字：沿半径方向排列 ——
            const mid = start + sweep / 2;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(mid);

            const fontSize = Math.max(11, Math.min(15, Math.round(size * 0.036)));
            ctx.font = `600 ${fontSize}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
            ctx.textBaseline = "middle";
            ctx.fillStyle = item.isBlank ? TEXT_BLANK : TEXT_PRIZE;

            // 扇区太窄时（< 12°）不画文字，避免糊成一团
            if (sweep > (12 * Math.PI) / 180) {
                const label = fitText(ctx, item.name, R * 0.56);

                // 中点在左半圆（cos(mid) < 0）时，径向文字会上下颠倒。
                // 额外旋转 180° 并改用左对齐，让文字始终正向可读。
                const flip = Math.cos(mid) < 0;
                if (flip) {
                    ctx.rotate(Math.PI);
                    ctx.textAlign = "left";
                    ctx.fillText(label, -(R - 14), 0);
                } else {
                    ctx.textAlign = "right";
                    ctx.fillText(label, R - 14, 0);
                }
            }

            ctx.restore();
            start += sweep;
        });

        // —— 外圈装饰 ——
        ctx.beginPath();
        ctx.arc(cx, cy, R - 1, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(0,0,0,0.06)";
        ctx.lineWidth = 2;
        ctx.stroke();
    }, [items, size]);

    return (
        <div
            ref={wrapRef}
            className="relative w-full flex justify-center select-none"
            // 供自动化测试核对"指针落点是否与抽中奖品一致"
            data-rotation={rotation}
            data-weights={items.map((i) => Math.max(1, i.weight)).join(",")}
            data-names={items.map((i) => i.name).join("|")}
        >
            <div className="relative" style={{ width: size, height: size }}>
                {/* 外发光圈 */}
                <div
                    className="absolute inset-0 rounded-full"
                    style={{
                        background: "linear-gradient(145deg, #ffd88a, #ffb347 55%, #ffd88a)",
                        padding: 7,
                        boxShadow: spinning
                            ? "0 0 42px rgba(255,179,71,0.65)"
                            : "0 8px 30px rgba(0,0,0,0.10)",
                        transition: "box-shadow .35s ease",
                    }}
                >
                    <div className="h-full w-full rounded-full bg-white p-1">
                        <canvas
                            ref={canvasRef}
                            className="rounded-full"
                            style={{
                                transform: `rotate(${rotation}rad)`,
                                transition: duration > 0
                                    ? `transform ${duration}ms cubic-bezier(0.16, 0.84, 0.12, 1)`
                                    : "none",
                                willChange: "transform",
                            }}
                            onTransitionEnd={() => {
                                if (spinning) onSpinEnd?.();
                            }}
                        />
                    </div>
                </div>

                {/* 指针：固定在正上方，不随转盘旋转 */}
                <div
                    className="absolute left-1/2 -translate-x-1/2 z-10"
                    style={{ top: -6 }}
                >
                    <div
                        style={{
                            width: 0,
                            height: 0,
                            borderLeft: "11px solid transparent",
                            borderRight: "11px solid transparent",
                            borderTop: "22px solid #ef4444",
                            filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.25))",
                        }}
                    />
                </div>

                {/* 中心按钮区 */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                        className="pointer-events-auto rounded-full bg-white shadow-lg flex items-center justify-center"
                        style={{ width: size * 0.34, height: size * 0.34 }}
                    >
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}
