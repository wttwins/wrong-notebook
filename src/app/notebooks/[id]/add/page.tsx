"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { UploadZone } from "@/components/upload-zone";
import { CorrectionEditor } from "@/components/correction-editor";
import { ImageCropper } from "@/components/image-cropper";
import { ParsedQuestion } from "@/lib/ai";
import { apiClient } from "@/lib/api-client";
import { AnalyzeResponse, Notebook } from "@/types/api";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { processImageFile } from "@/lib/image-utils";
import { ArrowLeft } from "lucide-react";
import { ProgressFeedback, ProgressStatus } from "@/components/ui/progress-feedback";

export default function AddErrorPage() {
    const params = useParams();
    const router = useRouter();
    const notebookId = params.id as string;
    const [step, setStep] = useState<"upload" | "review">("upload");
    const [analysisStep, setAnalysisStep] = useState<ProgressStatus>('idle');
    const [progress, setProgress] = useState(0);
    const [parsedData, setParsedData] = useState<ParsedQuestion | null>(null);
    const [currentImage, setCurrentImage] = useState<string | null>(null);
    const { t, language } = useLanguage();
    const [notebook, setNotebook] = useState<Notebook | null>(null);

    // Cropper state
    const [croppingImage, setCroppingImage] = useState<string | null>(null);
    const [isCropperOpen, setIsCropperOpen] = useState(false);

    useEffect(() => {
        // Fetch notebook info
        apiClient.get<Notebook>(`/api/notebooks/${notebookId}`)
            .then(data => setNotebook(data))
            .catch(err => {
                console.error("Failed to fetch notebook:", err);
                router.push("/notebooks");
            });
    }, [notebookId, router]);

    // Simulate progress for smoother UX
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (analysisStep !== 'idle') {
            setProgress(0);
            interval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 90) return prev;
                    return prev + Math.random() * 10;
                });
            }, 500);
        }
        return () => clearInterval(interval);
    }, [analysisStep]);

    const onImageSelect = (file: File) => {
        const imageUrl = URL.createObjectURL(file);
        setCroppingImage(imageUrl);
        setIsCropperOpen(true);
    };

    const handleCropComplete = async (croppedBlob: Blob) => {
        setIsCropperOpen(false);
        const file = new File([croppedBlob], "cropped-image.jpg", { type: "image/jpeg" });
        handleAnalyze(file);
    };

    const handleAnalyze = async (file: File) => {
        try {
            setAnalysisStep('compressing');
            const base64Image = await processImageFile(file);
            setCurrentImage(base64Image);

            setAnalysisStep('analyzing');
            const data = await apiClient.post<AnalyzeResponse>("/api/analyze", {
                imageBase64: base64Image,
                language: language,
                subjectId: notebookId
            });

            setAnalysisStep('processing');
            setProgress(100);

            setParsedData(data);
            setStep("review");
            setAnalysisStep('idle');
        } catch (error: any) {
            console.error('[AddError] Analysis error:', error);
            setAnalysisStep('idle');

            // 解析详细错误信息
            let errorMessage = t.common.messages?.analysisFailed || 'Analysis failed';

            if (error?.message) {
                // 检查是否是已知的 AI 错误类型
                const errorType = error.message;
                if (t.errors && errorType in t.errors) {
                    errorMessage = t.errors[errorType as keyof typeof t.errors];
                } else if (error.message === 'Network error' || error.message.includes('fetch')) {
                    errorMessage = t.errors?.AI_CONNECTION_FAILED || '网络连接失败';
                } else if (error.message.includes('parse') || error.message.includes('JSON') || error.message.includes('validate')) {
                    errorMessage = t.errors?.AI_RESPONSE_ERROR || 'AI 解析异常';
                } else if (error.message.includes('auth') || error.message.includes('API')) {
                    errorMessage = t.errors?.AI_AUTH_ERROR || '认证失败';
                } else {
                    // 如果有具体错误消息，显示它
                    errorMessage = error.message;
                }
            }

            alert(errorMessage);
        }
    };

    const handleSave = async (finalData: ParsedQuestion & { subjectId?: string; gradeSemester?: string; paperLevel?: string }) => {
        if (!currentImage) {
            alert(t.common.messages?.missingImage || 'Missing image');
            return;
        }

        try {
            await apiClient.post("/api/error-items", {
                ...finalData,
                originalImageUrl: currentImage,
                subjectId: notebookId,
            });

            alert(t.common.messages?.saveSuccess || 'Saved!');
            router.push(`/notebooks/${notebookId}`);
        } catch (error) {
            console.error(error);
            alert(t.common.messages?.saveFailed || 'Save failed');
        }
    };

    const getProgressMessage = () => {
        switch (analysisStep) {
            case 'compressing': return t.common.progress?.compressing || "Compressing...";
            case 'uploading': return t.common.progress?.uploading || "Uploading...";
            case 'analyzing': return t.common.progress?.analyzing || "Analyzing...";
            case 'processing': return t.common.progress?.processing || "Processing...";
            default: return "";
        }
    };

    if (!notebook) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-muted-foreground">{t.common.loading}</p>
            </div>
        );
    }

    return (
        <main className="min-h-screen bg-background">
            <ProgressFeedback
                status={analysisStep}
                progress={progress}
                message={getProgressMessage()}
            />

            <div className="container mx-auto p-4 space-y-8 pb-20">
                {/* Header Section */}
                <div className="flex items-center gap-4">
                    <Link href={`/notebooks/${notebookId}`}>
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-bold">{t.app.addError}</h1>
                </div>

                {/* Main Content */}
                {step === "upload" && (
                    <UploadZone onImageSelect={onImageSelect} isAnalyzing={analysisStep !== 'idle'} />
                )}

                {step === "review" && parsedData && currentImage && (
                    <CorrectionEditor
                        initialData={parsedData}
                        imagePreview={currentImage}
                        onSave={handleSave}
                        onCancel={() => setStep("upload")}
                        initialSubjectId={notebookId}
                    />
                )}
            </div>

            <ImageCropper
                imageSrc={croppingImage || ""}
                open={isCropperOpen}
                onClose={() => setIsCropperOpen(false)}
                onCropComplete={handleCropComplete}
            />
        </main>
    );
}
