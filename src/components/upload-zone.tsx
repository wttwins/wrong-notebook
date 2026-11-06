"use client";

import { useCallback, useState, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { UploadCloud, Loader2, Monitor } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// 添加 CaptureController 类型声明
declare global {
    interface Window {
        CaptureController: {
            new(): {
                setFocusBehavior(behavior: 'no-focus-change' | 'focus-capturing-application'): void;
            };
        };
    }
}

interface UploadZoneProps {
    onImageSelect: (file: File) => void;  // 改为传递 File 对象
    isAnalyzing: boolean;
}

export function UploadZone({ onImageSelect, isAnalyzing }: UploadZoneProps) {
    const { t } = useLanguage();
    const [isScreenshotting, setIsScreenshotting] = useState(false);
    const [isClient, setIsClient] = useState(false);
    // 确保只在客户端渲染屏幕截图功能
    useEffect(() => {
        setIsClient(true);

        // 请求通知权限
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    const onDrop = useCallback(
        (acceptedFiles: File[]) => {
            const file = acceptedFiles[0];
            if (file) {
                // 直接传递 File 对象，让父组件处理压缩
                onImageSelect(file);
            }
        },
        [onImageSelect]
    );

    const { getRootProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            "image/*": [".jpeg", ".jpg", ".png"],
        },
        maxFiles: 1,
        disabled: isAnalyzing,
    });

    // 点击上传用的真实文件输入框（铺满卡片，见下方 JSX 注释）
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onImageSelect(file);
        // 重置 value，否则连续选择同一文件不会再触发 change
        e.target.value = "";
    };

    // 检测是否为触摸设备（移动端），用于显示「点击选择」提示
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        setIsTouchDevice(
            "ontouchstart" in window ||
            (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0)
        );
    }, []);
    // 检查是否支持屏幕截图
    const isScreenshotSupported = () => {
        return isClient &&
            typeof navigator !== 'undefined' &&
            'mediaDevices' in navigator &&
            'getDisplayMedia' in navigator.mediaDevices;
    };
    // 屏幕截图功能
    const handleScreenshot = async () => {
        if (!isScreenshotSupported()) {
            alert(t.upload.screenshotNotSupported);
            return;
        }

        setIsScreenshotting(true);

        try {
            // 创建 CaptureController 来控制焦点行为
            let controller;
            if ('CaptureController' in window) {
                controller = new window.CaptureController();
            }

            // 请求屏幕共享权限，优先当前标签页
            const displayMediaOptions: DisplayMediaStreamOptions & {
                preferCurrentTab?: boolean;
                controller?: any;
            } = {
                video: true,
                audio: false,
                preferCurrentTab: false,  // 优先显示"此标签页"选项
            };

            if (controller) {
                (displayMediaOptions as any).controller = controller;
            }

            const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);

            // 获取视频轨道并检查捕获类型
            const [videoTrack] = stream.getVideoTracks();
            const settings = videoTrack.getSettings();
            const displaySurface = (settings as any).displaySurface;  // 'browser' 表示标签页

            // 如果是标签页或窗口，设置不切换焦点
            if (controller && (displaySurface === 'browser' || displaySurface === 'window')) {
                try {
                    controller.setFocusBehavior('no-focus-change');  // 关键：不切换焦点到选中标签页
                    console.log('✅ 已设置不切换焦点行为');
                } catch (e) {
                    console.warn('⚠️ 无法设置焦点行为:', e);
                }
            }

            // 创建视频元素
            const video = document.createElement('video');
            video.srcObject = stream;
            video.muted = true;
            video.autoplay = true;
            video.playsInline = true;

            // 等待视频准备并播放
            await new Promise<void>((resolve, reject) => {
                video.onloadedmetadata = () => {
                    video.play().then(() => {
                        resolve();
                    }).catch(reject);
                };
                video.onerror = reject;
            });

            // 等待一帧渲染（确保稳定）
            await new Promise(resolve => setTimeout(resolve, 500));

            // 检查视频尺寸
            if (video.videoWidth === 0 || video.videoHeight === 0) {
                throw new Error('视频没有有效尺寸');
            }

            // 创建canvas并捕获
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error('无法获取canvas上下文');
            }

            // 绘制视频帧
            ctx.drawImage(video, 0, 0);

            // 停止屏幕共享
            stream.getTracks().forEach(track => track.stop());

            // 转换为blob并创建文件
            canvas.toBlob((blob) => {
                if (blob) {
                    const file = new File([blob], `screenshot-${Date.now()}.png`, {
                        type: 'image/png'
                    });
                    onImageSelect(file);
                    console.log('✅ 截图完成，当前页面未跳转');
                } else {
                    alert('截图转换失败');
                }
            }, 'image/png', 1.0);

        } catch (error) {
            console.error('Screenshot failed:', error);
            if (error instanceof Error) {
                if (error.name === 'NotAllowedError') {
                    alert(t.upload.screenshotPermissionDenied);
                } else {
                    alert(`${t.upload.screenshotFailed}: ${error.message}`);
                }
            }
        } finally {
            setIsScreenshotting(false);
        }
    };
    return (
        <div className="space-y-4">
            {/*
              上传区域：
              react-dropzone 只负责「拖拽」（桌面端），点击上传改由下面这个
              覆盖式 <input type="file"> 承担。

              为什么不用 getInputProps() 的隐藏 input：
              它在 iOS Safari 上会呈现为 1px 的视觉隐藏元素，
              点击卡片时程序化 .click() 可能被系统拦截，
              导致「点了没反应」。这里改成铺满卡片、opacity-0 的真实 input，
              用户点到的就是 input 本身，iOS 原生支持，最稳妥。
            */}
            {/*
              注意：这里不能再加 [&_input[type=file]]:hidden 之类的容器级样式，
              它会连下面这个「铺满卡片的可见 input」一起隐藏掉，
              导致包围盒为 0、点击完全无效（已实测踩过这个坑）。
            */}
            <div {...getRootProps({ noClick: true })}>
                <label
                    htmlFor="upload-zone-file"
                    className={`block w-full ${isAnalyzing ? "cursor-not-allowed" : "cursor-pointer"}`}
                >
                    <Card
                        className={`relative overflow-hidden border-2 border-dashed transition-colors hover:border-primary/50 ${isDragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25"
                            }`}
                    >
                        {/*
                          真实文件输入：铺满卡片、透明但可点击。
                          用 opacity-0 而非 display:none —— 后者在 iOS Safari 上
                          无法唤起文件选择器。
                        */}
                        <input
                            id="upload-zone-file"
                            ref={fileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/*"
                            className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                            disabled={isAnalyzing}
                            onChange={handleFileChange}
                        />
                        <CardContent className="pointer-events-none flex min-h-[300px] flex-col items-center justify-center space-y-4 py-12 text-center">
                            <div className="rounded-full bg-muted p-4">
                                {isAnalyzing ? (
                                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                ) : (
                                    <UploadCloud className="h-10 w-10 text-muted-foreground" />
                                )}
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-semibold">
                                    {isAnalyzing ? t.app.analyzing : t.upload.analyze}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {isAnalyzing ? t.app.analyzing : t.app.dragDrop}
                                </p>
                                {/*
                                  仅在翻译文件里确实提供了 tapToSelect 时才额外显示一行，
                                  否则会与上一行的 dragDrop 文案完全重复（曾出现重复两遍的问题）。
                                */}
                                {isTouchDevice && (t.upload as Record<string, string>).tapToSelect && (
                                    <p className="text-sm font-medium text-primary">
                                        {(t.upload as Record<string, string>).tapToSelect}
                                    </p>
                                )}
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {t.upload.support}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </label>
            </div>

            {/* 屏幕截图按钮 - 只在支持 getDisplayMedia 的浏览器渲染（桌面端） */}
            {isScreenshotSupported() && (
                <div className="flex flex-col items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={handleScreenshot}
                        disabled={isAnalyzing || isScreenshotting}
                        className="flex items-center gap-2"
                    >
                        {isScreenshotting ? (
                            <Loader2 className="h-4 w-4 md:h-6 md:w-6 animate-spin" />
                        ) : (
                            <Monitor className="h-4 w-4 md:h-6 md:w-6" />
                        )}
                        {isScreenshotting ? t.common.pleaseWait : t.upload.screenshot}
                    </Button>
                    <p className="text-center text-xs text-muted-foreground">
                        {t.upload.screenshotDesc}
                    </p>
                </div>
            )}
        </div>
    );
}
