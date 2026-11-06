"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { UploadZone } from "@/components/upload-zone";
import { CorrectionEditor } from "@/components/correction-editor";
import { ImageCropper } from "@/components/image-cropper";
import { ParsedQuestion } from "@/lib/ai";
import { apiClient } from "@/lib/api-client";
import { AnalyzeResponse, Notebook, RuntimeConfig } from "@/types/api";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { processImageFile } from "@/lib/image-utils";
import { ArrowLeft, Upload, PenLine } from "lucide-react";
import { ProgressFeedback, ProgressStatus } from "@/components/ui/progress-feedback";
import { frontendLogger } from "@/lib/frontend-logger";
import { TextInputZone } from "@/components/text-input-zone";

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
    const [config, setConfig] = useState<RuntimeConfig | null>(null);

    // Input mode: "image" for photo upload, "text" for manual text input
    const [inputMode, setInputMode] = useState<"image" | "text">("image");

    // Cropper state
    const [croppingImage, setCroppingImage] = useState<string | null>(null);
    const [isCropperOpen, setIsCropperOpen] = useState(false);

    // Timeout Config
    const aiTimeout = config?.timeouts?.analyze || 180000;
    const safetyTimeout = aiTimeout + 10000;

    // Cleanup Blob URL to prevent memory leak
    useEffect(() => {
        return () => {
            if (croppingImage) {
                URL.revokeObjectURL(croppingImage);
            }
        };
    }, [croppingImage]);

    useEffect(() => {
        // Fetch notebook info
        apiClient.get<Notebook>(`/api/notebooks/${notebookId}`)
            .then(data => setNotebook(data))
            .catch(err => {
                console.error("Failed to fetch notebook:", err);
                router.push("/notebooks");
            });

        // Fetch only non-secret runtime settings; full AI settings are admin-only.
        apiClient.get<RuntimeConfig>("/api/runtime-config")
            .then(data => {
                setConfig(data);
                if (data.timeouts?.analyze) {
                    frontendLogger.info('[Config]', 'Loaded timeout settings', {
                        analyze: data.timeouts.analyze
                    });
                }
            })
            .catch(err => console.error("Failed to fetch config:", err));
    }, [notebookId, router]);

    // Simulate progress for smoother UX with timeout protection
    useEffect(() => {
        let interval: NodeJS.Timeout;
        let timeout: NodeJS.Timeout;
        if (analysisStep !== 'idle') {
            setProgress(0);
            interval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 90) return prev;
                    return prev + Math.random() * 10;
                });
            }, 500);

            // Safety timeout: auto-reset after configurable time to prevent stuck overlay
            timeout = setTimeout(() => {
                console.warn('[Progress] Safety timeout triggered - resetting analysisStep');
                setAnalysisStep('idle');
            }, safetyTimeout);
        }
        return () => {
            clearInterval(interval);
            clearTimeout(timeout);
        };
    }, [analysisStep, safetyTimeout]);

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
        const startTime = Date.now();
        frontendLogger.info('[AddAnalyze]', 'Starting analysis flow', {
            timeoutSettings: {
                apiTimeout: aiTimeout,
                safetyTimeout
            }
        });

        try {
            frontendLogger.info('[AddAnalyze]', 'Step 1/5: Compressing image');
            setAnalysisStep('compressing');
            const base64Image = await processImageFile(file);
            setCurrentImage(base64Image);
            frontendLogger.info('[AddAnalyze]', 'Image compressed successfully', {
                size: base64Image.length
            });

            frontendLogger.info('[AddAnalyze]', 'Step 2/5: Calling API endpoint /api/analyze');
            setAnalysisStep('analyzing');
            const apiStartTime = Date.now();
            const data = await apiClient.post<AnalyzeResponse>("/api/analyze", {
                imageBase64: base64Image,
                language: language,
                subjectId: notebookId
            }, { timeout: aiTimeout }); // Use configured timeout
            const apiDuration = Date.now() - apiStartTime;
            frontendLogger.info('[AddAnalyze]', 'API response received, validating data', {
                apiDuration
            });

            // Validate response data
            if (!data || typeof data !== 'object') {
                frontendLogger.error('[AddAnalyze]', 'Validation failed - invalid response data', {
                    data
                });
                throw new Error('Invalid API response: data is null or not an object');
            }
            frontendLogger.info('[AddAnalyze]', 'Response data validated successfully');

            frontendLogger.info('[AddAnalyze]', 'Step 3/5: Setting processing state and progress to 100%');
            setAnalysisStep('processing');
            setProgress(100);
            frontendLogger.info('[AddAnalyze]', 'Progress updated to 100%');

            frontendLogger.info('[AddAnalyze]', 'Step 4/5: Setting parsed data into state');
            const dataSize = JSON.stringify(data).length;
            const setDataStart = Date.now();
            setParsedData(data);
            const setDataDuration = Date.now() - setDataStart;
            frontendLogger.info('[AddAnalyze]', 'Parsed data set successfully', {
                dataSize,
                setDataDuration
            });

            frontendLogger.info('[AddAnalyze]', 'Step 5/5: Switching to review page');
            const setStepStart = Date.now();
            setStep("review");
            const setStepDuration = Date.now() - setStepStart;
            frontendLogger.info('[AddAnalyze]', 'Step switched to review', {
                setStepDuration
            });
            const totalDuration = Date.now() - startTime;
            frontendLogger.info('[AddAnalyze]', 'Analysis completed successfully', {
                totalDuration
            });
        } catch (error: any) {
            const errorDuration = Date.now() - startTime;
            frontendLogger.error('[AddError]', 'Analysis failed', {
                errorDuration,
                error: error.message || String(error)
            });

            // 安全的错误处理逻辑，防止在报错时二次报错
            try {
                // 解析详细错误信息
                let errorMessage = t.common.messages?.analysisFailed || 'Analysis failed';

                // ApiError 的结构：error.data.message 包含后端返回的错误类型
                const backendErrorType = error?.data?.message;

                if (backendErrorType && typeof backendErrorType === 'string') {
                    // 检查是否是已知的 AI 错误类型
                    // 使用安全访问
                    if (t.errors && typeof t.errors === 'object' && backendErrorType in t.errors) {
                        const mappedError = (t.errors as any)[backendErrorType];
                        if (typeof mappedError === 'string') {
                            errorMessage = mappedError;
                            frontendLogger.info('[AddError]', `Matched error type: ${backendErrorType}`, {
                                errorMessage
                            });
                        }
                    } else {
                        // 使用后端返回的具体错误消息
                        errorMessage = backendErrorType;
                        frontendLogger.info('[AddError]', 'Using backend error message', {
                            errorMessage
                        });
                    }
                } else if (error?.message) {
                    // Fallback：检查 error.message（用于非 API 错误）
                    if (error.message.includes('fetch') || error.message.includes('network')) {
                        errorMessage = t.errors?.AI_CONNECTION_FAILED || '网络连接失败';
                    } else if (typeof error.data === 'string') {
                        // 如果 data 是字符串（例如 HTML 错误页），可能包含提示
                        frontendLogger.info('[AddError]', 'Raw error data', {
                            errorDataPreview: error.data.substring(0, 100)
                        });
                        errorMessage += ` (${error.status || 'Error'})`;
                    }
                }

                alert(errorMessage);
            } catch (innerError) {
                frontendLogger.error('[AddError]', 'Failed to process error message', {
                    innerError: String(innerError)
                });
                // 确保至少弹出一个提示
                alert('Analysis failed. Please try again.');
            }
        } finally {
            // Always reset analysis state, even if setState throws
            frontendLogger.info('[AddAnalyze]', 'Finally: Resetting analysis state to idle');
            setAnalysisStep('idle');
            frontendLogger.info('[AddAnalyze]', 'Analysis state reset complete');
        }
    };

    const handleTextSubmit = async (questionText: string) => {
        const startTime = Date.now();
        frontendLogger.info('[AddTextSubmit]', 'Starting text-based analysis', { textLength: questionText.length });

        try {
            setAnalysisStep('analyzing');

            const result = await apiClient.post<{
                answerText: string;
                analysis: string;
                knowledgePoints: string[];
                wrongAnswerText: string;
                mistakeAnalysis: string;
                mistakeStatus: string;
            }>("/api/reanswer", {
                questionText,
                language,
                subject: notebook?.name || undefined,
            }, { timeout: aiTimeout });

            setAnalysisStep('processing');
            setProgress(100);

            const parsed: ParsedQuestion = {
                questionText,
                answerText: result.answerText,
                analysis: result.analysis,
                knowledgePoints: result.knowledgePoints || [],
                wrongAnswerText: result.wrongAnswerText || "",
                mistakeAnalysis: result.mistakeAnalysis || "",
                mistakeStatus: (result.mistakeStatus as any) || "unknown",
                subject: "数学",
                requiresImage: false,
            };

            setCurrentImage(null);
            setParsedData(parsed);
            setStep("review");

            const totalDuration = Date.now() - startTime;
            frontendLogger.info('[AddTextSubmit]', 'Text analysis completed', { totalDuration });
        } catch (error: any) {
            const errorDuration = Date.now() - startTime;
            frontendLogger.error('[AddTextSubmit]', 'Analysis failed', {
                errorDuration,
                error: error.message || String(error)
            });

            try {
                let errorMessage = t.common.messages?.analysisFailed || 'Analysis failed';
                const backendErrorType = error?.data?.message;
                if (backendErrorType && typeof backendErrorType === 'string') {
                    if (t.errors && typeof t.errors === 'object' && backendErrorType in t.errors) {
                        const mappedError = (t.errors as any)[backendErrorType];
                        if (typeof mappedError === 'string') errorMessage = mappedError;
                    } else {
                        errorMessage = backendErrorType;
                    }
                }
                alert(errorMessage);
            } catch {
                alert('Analysis failed. Please try again.');
            }
        } finally {
            setAnalysisStep('idle');
        }
    };

    const handleSave = async (finalData: ParsedQuestion & { subjectId?: string; gradeSemester?: string; paperLevel?: string }): Promise<void> => {
        try {
            const result = await apiClient.post<{ id: string; duplicate?: boolean }>("/api/error-items", {
                ...finalData,
                originalImageUrl: currentImage || "",
                subjectId: notebookId,
            });

            // 检查是否是重复提交（后端去重返回）
            if (result.duplicate) {
                frontendLogger.info('[AddSave]', 'Duplicate submission detected, using existing record');
            }

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

            <div className="container mx-auto p-4 space-y-8 pb-20 max-w-5xl md:px-6 md:py-8">
                {/* Header Section */}
                <div className="flex items-center gap-4">
                    <Link href={`/notebooks/${notebookId}`}>
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="h-5 w-5 md:h-6 md:w-6" />
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-bold">{t.app.addError}</h1>
                </div>

                {/* Main Content */}
                {step === "upload" && (
                    <div className="space-y-4">
                        {/* Input mode tabs */}
                        <div className="flex gap-2 border-b">
                            <button
                                className={`flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                    inputMode === "image"
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                                onClick={() => setInputMode("image")}
                            >
                                <Upload className="h-4 w-4 md:h-6 md:w-6" />
                                {t.app?.uploadImage || "拍照上传"}
                            </button>
                            <button
                                className={`flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                                    inputMode === "text"
                                        ? "border-primary text-primary"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                                onClick={() => setInputMode("text")}
                            >
                                <PenLine className="h-4 w-4 md:h-6 md:w-6" />
                                {t.app?.manualInput || "手动输入"}
                            </button>
                        </div>

                        {inputMode === "image" ? (
                            <UploadZone onImageSelect={onImageSelect} isAnalyzing={analysisStep !== 'idle'} />
                        ) : (
                            <TextInputZone
                                onSubmit={handleTextSubmit}
                                isAnalyzing={analysisStep !== 'idle'}
                                defaultNotebookName={notebook?.name}
                            />
                        )}
                    </div>
                )}

                {step === "review" && parsedData && (
                    <CorrectionEditor
                        initialData={parsedData}
                        imagePreview={currentImage}
                        onSave={handleSave}
                        onCancel={() => setStep("upload")}
                        initialSubjectId={notebookId}
                        aiTimeout={aiTimeout}
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
