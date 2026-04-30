"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CheckCircle, XCircle, RefreshCw, Trash2, Edit, Save, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { TagInput } from "@/components/tag-input";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiClient } from "@/lib/api-client";
import { UserProfile, Notebook } from "@/types/api";
import { inferSubjectFromName } from "@/lib/knowledge-tags";
import { getMistakeStatusLabel, normalizeMistakeStatusForSave } from "@/lib/mistake-status";
import { NotebookSelector } from "@/components/notebook-selector";

interface KnowledgeTag {
    id: string;
    name: string;
}

interface ErrorItemDetail {
    id: string;
    questionText: string;
    answerText: string;
    analysis: string;
    wrongAnswerText?: string | null;
    mistakeAnalysis?: string | null;
    mistakeStatus?: string | null;
    knowledgePoints: string; // 保留兼容旧数据
    tags: KnowledgeTag[]; // 新的标签关联
    masteryLevel: number;
    originalImageUrl: string;
    userNotes: string | null;
    subjectId?: string | null;
    subject?: {
        id: string;
        name: string;
    } | null;
    gradeSemester?: string | null;
    paperLevel?: string | null;
}

export default function ErrorDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { t, language } = useLanguage();
    const [item, setItem] = useState<ErrorItemDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [notesInput, setNotesInput] = useState("");
    const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
    const [isEditingTags, setIsEditingTags] = useState(false);
    const [tagsInput, setTagsInput] = useState<string[]>([]);
    const [isEditingMetadata, setIsEditingMetadata] = useState(false);
    const [gradeSemesterInput, setGradeSemesterInput] = useState("");
    const [paperLevelInput, setPaperLevelInput] = useState("a");
    const [notebookInput, setNotebookInput] = useState<string | null>(null);

    const [educationStage, setEducationStage] = useState<string | undefined>(undefined);

    useEffect(() => {
        // Fetch user info for education stage
        apiClient.get<UserProfile>("/api/user")
            .then(user => {
                if (user && user.educationStage) {
                    setEducationStage(user.educationStage);
                }
            })
            .catch(err => console.error("Failed to fetch user info:", err));

        if (params.id) {
            fetchItem(params.id as string);
        }
    }, [params.id]);

    const fetchItem = async (id: string) => {
        try {
            const data = await apiClient.get<ErrorItemDetail>(`/api/error-items/${id}`);
            setItem(data);
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.loadFailed || 'Failed to load item');
            router.push("/notebooks");
        } finally {
            setLoading(false);
        }
    };

    const toggleMastery = async () => {
        if (!item) return;

        const newLevel = item.masteryLevel > 0 ? 0 : 1;

        try {
            await apiClient.patch(`/api/error-items/${item.id}/mastery`, { masteryLevel: newLevel });
            setItem({ ...item, masteryLevel: newLevel });
            alert(newLevel > 0 ? (t.common?.messages?.markMastered || 'Marked as mastered') : (t.common?.messages?.unmarkMastered || 'Unmarked'));
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.updateFailed || 'Update failed');
        }
    };

    const deleteItem = async () => {
        if (!item) return;

        const confirmMessage = t.common?.messages?.confirmDelete || 'Are you sure you want to delete this error item?';
        if (!confirm(confirmMessage)) return;

        try {
            await apiClient.delete(`/api/error-items/${item.id}/delete`);
            alert(t.common?.messages?.deleteSuccess || 'Deleted successfully');
            if (item.subjectId) {
                router.push(`/notebooks/${item.subjectId}`);
            } else {
                router.push('/notebooks');
            }
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.deleteFailed || 'Delete failed');
        }
    };

    const startEditingNotes = () => {
        setNotesInput(item?.userNotes || "");
        setIsEditingNotes(true);
    };

    const cancelEditingNotes = () => {
        setIsEditingNotes(false);
        setNotesInput("");
    };

    const startEditingTags = () => {
        if (item) {
            // 优先使用新的 tags 关联
            if (item.tags && item.tags.length > 0) {
                setTagsInput(item.tags.map(t => t.name));
            } else if (item.knowledgePoints) {
                // 回退到旧的 knowledgePoints 字段
                try {
                    const tags = JSON.parse(item.knowledgePoints);
                    setTagsInput(tags);
                } catch (e) {
                    setTagsInput([]);
                }
            } else {
                setTagsInput([]);
            }
            setIsEditingTags(true);
        }
    };

    const saveTagsHandler = async () => {
        try {
            // 直接传递标签名称数组，后端会处理关联
            await apiClient.put(`/api/error-items/${item?.id}`, {
                knowledgePoints: tagsInput, // 后端接收数组
            });

            setIsEditingTags(false);
            await fetchItem(params.id as string);
            alert(t.common?.messages?.tagUpdateSuccess || 'Tags updated successfully!');
        } catch (error) {
            console.error("[Frontend] Error updating:", error);
            alert(t.common?.messages?.updateFailed || 'Update failed');
        }
    };

    const cancelEditingTags = () => {
        setIsEditingTags(false);
        setTagsInput([]);
    };

    const startEditingMetadata = () => {
        if (item) {
            setNotebookInput(item.subjectId || null);
            setGradeSemesterInput(item.gradeSemester || "");
            setPaperLevelInput(item.paperLevel || "a");
            setIsEditingMetadata(true);
        }
    };

    const saveMetadataHandler = async () => {
        try {
            await apiClient.put(`/api/error-items/${item?.id}`, {
                subjectId: notebookInput || null,
                gradeSemester: gradeSemesterInput,
                paperLevel: paperLevelInput,
            });

            setIsEditingMetadata(false);
            fetchItem(params.id as string);
            alert(t.common?.messages?.metaUpdateSuccess || 'Metadata updated successfully!');
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.updateFailed || 'Update failed');
        }
    };

    const cancelEditingMetadata = () => {
        setIsEditingMetadata(false);
        setNotebookInput(null);
        setGradeSemesterInput("");
        setPaperLevelInput("a");
    };

    const [isEditingQuestion, setIsEditingQuestion] = useState(false);
    const [questionInput, setQuestionInput] = useState("");

    const [isEditingAnswer, setIsEditingAnswer] = useState(false);
    const [answerInput, setAnswerInput] = useState("");

    const [isEditingAnalysis, setIsEditingAnalysis] = useState(false);
    const [analysisInput, setAnalysisInput] = useState("");

    const [isEditingMistake, setIsEditingMistake] = useState(false);
    const [wrongAnswerInput, setWrongAnswerInput] = useState("");
    const [mistakeAnalysisInput, setMistakeAnalysisInput] = useState("");
    const [mistakeStatusInput, setMistakeStatusInput] = useState("unknown");

    // --- Question Handlers ---
    const startEditingQuestion = () => {
        if (item) {
            setQuestionInput(item.questionText);
            setIsEditingQuestion(true);
        }
    };

    const saveQuestionHandler = async () => {
        try {
            await apiClient.put(`/api/error-items/${item?.id}`, { questionText: questionInput });
            setIsEditingQuestion(false);
            if (item) setItem({ ...item, questionText: questionInput });
            alert(t.common?.messages?.saveSuccess || 'Saved successfully');
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.saveFailed || 'Save failed');
        }
    };

    const cancelEditingQuestion = () => {
        setIsEditingQuestion(false);
        setQuestionInput("");
    };

    // --- Answer Handlers ---
    const startEditingAnswer = () => {
        if (item) {
            setAnswerInput(item.answerText);
            setIsEditingAnswer(true);
        }
    };

    const saveAnswerHandler = async () => {
        try {
            await apiClient.put(`/api/error-items/${item?.id}`, { answerText: answerInput });
            setIsEditingAnswer(false);
            if (item) setItem({ ...item, answerText: answerInput });
            alert(t.common?.messages?.saveSuccess || 'Saved successfully');
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.saveFailed || 'Save failed');
        }
    };

    const cancelEditingAnswer = () => {
        setIsEditingAnswer(false);
        setAnswerInput("");
    };

    // --- Analysis Handlers ---
    const startEditingAnalysis = () => {
        if (item) {
            setAnalysisInput(item.analysis);
            setIsEditingAnalysis(true);
        }
    };

    const saveAnalysisHandler = async () => {
        try {
            await apiClient.put(`/api/error-items/${item?.id}`, { analysis: analysisInput });
            setIsEditingAnalysis(false);
            if (item) setItem({ ...item, analysis: analysisInput });
            alert(t.common?.messages?.saveSuccess || 'Saved successfully');
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.saveFailed || 'Save failed');
        }
    };

    const cancelEditingAnalysis = () => {
        setIsEditingAnalysis(false);
        setAnalysisInput("");
    };

    // --- Mistake Analysis Handlers ---
    const startEditingMistake = () => {
        if (item) {
            setWrongAnswerInput(item.wrongAnswerText || "");
            setMistakeAnalysisInput(item.mistakeAnalysis || "");
            setMistakeStatusInput(item.mistakeStatus || "unknown");
            setIsEditingMistake(true);
        }
    };

    const saveMistakeHandler = async () => {
        try {
            const normalizedStatus = normalizeMistakeStatusForSave(
                mistakeStatusInput,
                wrongAnswerInput
            );
            await apiClient.put(`/api/error-items/${item?.id}`, {
                wrongAnswerText: wrongAnswerInput,
                mistakeAnalysis: mistakeAnalysisInput,
                mistakeStatus: normalizedStatus,
            });
            setIsEditingMistake(false);
            if (item) {
                setItem({
                    ...item,
                    wrongAnswerText: wrongAnswerInput,
                    mistakeAnalysis: mistakeAnalysisInput,
                    mistakeStatus: normalizedStatus,
                });
            }
            alert(t.common?.messages?.saveSuccess || 'Saved successfully');
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.saveFailed || 'Save failed');
        }
    };

    const cancelEditingMistake = () => {
        setIsEditingMistake(false);
        setWrongAnswerInput("");
        setMistakeAnalysisInput("");
        setMistakeStatusInput("unknown");
    };

    const saveNotes = async () => {
        if (!item) return;

        try {
            await apiClient.patch(`/api/error-items/${item.id}/notes`, { userNotes: notesInput });
            setItem({ ...item, userNotes: notesInput });
            setIsEditingNotes(false);
            alert(t.common?.messages?.noteSaveSuccess || 'Notes saved successfully');
        } catch (error) {
            console.error(error);
            alert(t.common?.messages?.saveFailed || 'Save failed');
        }
    };

    if (loading) return <div className="p-8 text-center">{t.common.loading}</div>;
    if (!item) return <div className="p-8 text-center">{t.detail.notFound || "Item not found"}</div>;

    // 优先从 tags 关联获取，回退到 knowledgePoints
    let tags: string[] = [];
    if (item.tags && item.tags.length > 0) {
        tags = item.tags.map(t => t.name);
    } else if (item.knowledgePoints) {
        try {
            const parsed = JSON.parse(item.knowledgePoints);
            tags = Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            tags = [];
        }
    }

    return (
        <main className="min-h-screen bg-background">
            <div className="container mx-auto p-4 space-y-6 pb-20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-4">
                        <Link href={item.subjectId ? `/notebooks/${item.subjectId}` : "/notebooks"}>
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="w-4 h-4" />
                            </Button>
                        </Link>
                        <h1 className="text-2xl font-bold">{t.detail.title}</h1>
                    </div>

                    <div className="flex gap-2">
                        <Link href={`/practice?id=${item.id}`}>
                            <Button variant="outline" size="sm">
                                <RefreshCw className="mr-2 h-4 w-4" />
                                {t.detail.practice}
                            </Button>
                        </Link>
                        <Button
                            size="sm"
                            variant={item.masteryLevel > 0 ? "default" : "default"}
                            className={item.masteryLevel > 0 ? "bg-green-600 hover:bg-green-700 text-white" : ""}
                            onClick={toggleMastery}
                        >
                            {item.masteryLevel > 0 ? (
                                <>
                                    <CheckCircle className="mr-2 h-4 w-4" />
                                    {t.detail.mastered}
                                </>
                            ) : (
                                <>
                                    <XCircle className="mr-2 h-4 w-4" />
                                    {t.detail.markMastered}
                                </>
                            )}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={deleteItem}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t.detail.delete || "Delete"}
                        </Button>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Left Column: Question & Image */}
                    <div className="space-y-6 min-w-0">
                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>{t.detail.question}</CardTitle>
                                    {!isEditingQuestion && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={startEditingQuestion}
                                        >
                                            <Edit className="h-4 w-4 mr-1" />
                                            {t.common?.edit || 'Edit'}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {item.originalImageUrl && (
                                    <div
                                        className="cursor-pointer hover:opacity-90 transition-opacity"
                                        onClick={() => setIsImageViewerOpen(true)}
                                        title={t.detail?.clickToView || 'Click to view full image'}
                                    >
                                        <p className="text-sm font-medium mb-2 text-muted-foreground">
                                            {t.detail.originalProblem || "Original Problem"}
                                        </p>
                                        <img
                                            src={item.originalImageUrl}
                                            alt={t.detail.originalProblem || "Original Problem"}
                                            className="w-full rounded-lg border hover:border-primary/50 transition-colors"
                                        />
                                        <p className="text-xs text-muted-foreground mt-1 text-center">
                                            💡 {t.detail?.clickToEnlarge || 'Click to enlarge'}
                                        </p>
                                    </div>
                                )}

                                {isEditingQuestion ? (
                                    <div className="space-y-3">
                                        <Textarea
                                            value={questionInput}
                                            onChange={(e) => setQuestionInput(e.target.value)}
                                            placeholder="Enter question text..." // Consider localizing later
                                            rows={8}
                                            className="w-full font-mono text-sm"
                                        />
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={saveQuestionHandler}>
                                                <Save className="h-4 w-4 mr-1" />
                                                {t.common?.save || 'Save'}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={cancelEditingQuestion}>
                                                <X className="h-4 w-4 mr-1" />
                                                {t.common?.cancel || 'Cancel'}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <MarkdownRenderer content={item.questionText} />
                                )}

                                {/* 知识点标签 */}
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-sm font-semibold">{t.editor?.tags || 'Knowledge Tags'}</h4>
                                        {!isEditingTags && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={startEditingTags}
                                            >
                                                <Edit className="h-4 w-4 mr-1" />
                                                {t.common?.edit || 'Edit'}
                                            </Button>
                                        )}
                                    </div>

                                    {isEditingTags ? (
                                        <div className="space-y-3">
                                            <TagInput
                                                value={tagsInput}
                                                onChange={setTagsInput}
                                                placeholder={t.editor?.tagsPlaceholder || 'Enter or select knowledge tags...'}
                                                subject={inferSubjectFromName(item.subject?.name || null) || undefined}
                                                gradeStage={educationStage}
                                            />
                                            <p className="text-xs text-muted-foreground">
                                                {t.editor?.tagsHint || '💡 Select from standard or custom tags'}
                                            </p>
                                            <div className="flex gap-2">
                                                <Button size="sm" onClick={saveTagsHandler}>
                                                    <Save className="h-4 w-4 mr-1" />
                                                    {t.common?.save || 'Save'}
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={cancelEditingTags}>
                                                    <X className="h-4 w-4 mr-1" />
                                                    {t.common?.cancel || 'Cancel'}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {tags.map((tag) => (
                                                <Badge key={tag} variant="secondary">
                                                    {tag}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* 年级/学期 和 试卷等级 */}
                                <div className="space-y-2 pt-4 border-t">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-sm font-semibold">
                                            {t.detail?.questionInfo || 'Question Info'}
                                        </h4>
                                        {!isEditingMetadata && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={startEditingMetadata}
                                            >
                                                <Edit className="h-4 w-4 mr-1" />
                                                {t.common?.edit || 'Edit'}
                                            </Button>
                                        )}
                                    </div>

                                    {isEditingMetadata ? (
                                        <div className="space-y-3">
                                            <div className="space-y-2">
                                                <label className="text-sm text-muted-foreground">
                                                    {t.notebooks?.title || 'Notebook'}
                                                </label>
                                                <NotebookSelector
                                                    value={notebookInput || undefined}
                                                    onChange={(val) => setNotebookInput(val)}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm text-muted-foreground">
                                                    {t.filter.grade}
                                                </label>
                                                <Input
                                                    value={gradeSemesterInput}
                                                    onChange={(e) => setGradeSemesterInput(e.target.value)}
                                                    placeholder={t.notebook?.gradeSemesterPlaceholder || 'e.g. Grade 7, Semester 1'}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm text-muted-foreground">
                                                    {t.filter.paperLevel}
                                                </label>
                                                <Select
                                                    value={paperLevelInput}
                                                    onValueChange={setPaperLevelInput}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="a">{t.editor.paperLevels?.a || 'Paper A'}</SelectItem>
                                                        <SelectItem value="b">{t.editor.paperLevels?.b || 'Paper B'}</SelectItem>
                                                        <SelectItem value="other">{t.editor.paperLevels?.other || 'Other'}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex gap-2">
                                                <Button size="sm" onClick={saveMetadataHandler}>
                                                    <Save className="h-4 w-4 mr-1" />
                                                    {t.common?.save || 'Save'}
                                                </Button>
                                                <Button size="sm" variant="outline" onClick={cancelEditingMetadata}>
                                                    <X className="h-4 w-4 mr-1" />
                                                    {t.common?.cancel || 'Cancel'}
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">{t.notebooks?.title || 'Notebook'}:</span>
                                                <span className="font-medium">
                                                    {item.subject?.name || (t.common?.notSet || 'Not set')}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">{t.filter.grade}:</span>
                                                <span className="font-medium">
                                                    {item.gradeSemester || (t.common?.notSet || 'Not set')}
                                                </span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">{t.filter.paperLevel}:</span>
                                                <span className="font-medium">
                                                    {item.paperLevel ? (t.editor.paperLevels?.[item.paperLevel as 'a' | 'b' | 'other'] || item.paperLevel) : (t.common?.notSet || 'Not set')}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>{t.detail.yourNotes}</CardTitle>
                                    {!isEditingNotes && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={startEditingNotes}
                                        >
                                            <Edit className="h-4 w-4 mr-1" />
                                            {t.detail.editNotes || "Edit"}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                {isEditingNotes ? (
                                    <div className="space-y-3">
                                        <Textarea
                                            value={notesInput}
                                            onChange={(e) => setNotesInput(e.target.value)}
                                            placeholder={t.detail.notesPlaceholder || "Enter your notes..."}
                                            rows={5}
                                            className="w-full"
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={saveNotes}
                                            >
                                                <Save className="h-4 w-4 mr-1" />
                                                {t.common.save || "Save"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={cancelEditingNotes}
                                            >
                                                <X className="h-4 w-4 mr-1" />
                                                {t.common.cancel || "Cancel"}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="whitespace-pre-wrap">
                                        {item.userNotes ? (
                                            <p className="text-foreground">{item.userNotes}</p>
                                        ) : (
                                            <p className="text-muted-foreground italic">
                                                {t.detail.noNotes}
                                            </p>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Right Column: Analysis & Answer */}
                    <div className="space-y-6 min-w-0">
                        <Card className="border-primary/20">
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle className="text-primary">{t.detail.correctAnswer}</CardTitle>
                                    {!isEditingAnswer && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={startEditingAnswer}
                                        >
                                            <Edit className="h-4 w-4 mr-1" />
                                            {t.common?.edit || 'Edit'}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent>
                                {isEditingAnswer ? (
                                    <div className="space-y-3">
                                        <Textarea
                                            value={answerInput}
                                            onChange={(e) => setAnswerInput(e.target.value)}
                                            placeholder="Enter answer..."
                                            rows={5}
                                            className="w-full font-mono text-sm"
                                        />
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={saveAnswerHandler}>
                                                <Save className="h-4 w-4 mr-1" />
                                                {t.common?.save || 'Save'}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={cancelEditingAnswer}>
                                                <X className="h-4 w-4 mr-1" />
                                                {t.common?.cancel || 'Cancel'}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <MarkdownRenderer content={item.answerText} className="font-semibold" />
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>{t.detail.analysis}</CardTitle>
                                    {!isEditingAnalysis && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={startEditingAnalysis}
                                        >
                                            <Edit className="h-4 w-4 mr-1" />
                                            {t.common?.edit || 'Edit'}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isEditingAnalysis ? (
                                    <div className="space-y-3">
                                        <Textarea
                                            value={analysisInput}
                                            onChange={(e) => setAnalysisInput(e.target.value)}
                                            placeholder="Enter analysis..."
                                            rows={12}
                                            className="w-full font-mono text-sm"
                                        />
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={saveAnalysisHandler}>
                                                <Save className="h-4 w-4 mr-1" />
                                                {t.common?.save || 'Save'}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={cancelEditingAnalysis}>
                                                <X className="h-4 w-4 mr-1" />
                                                {t.common?.cancel || 'Cancel'}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <MarkdownRenderer content={item.analysis} />
                                )}
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <div className="flex justify-between items-center">
                                    <CardTitle>{t.detail?.mistakeAnalysis || '错因分析'}</CardTitle>
                                    {!isEditingMistake && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={startEditingMistake}
                                        >
                                            <Edit className="h-4 w-4 mr-1" />
                                            {t.common?.edit || 'Edit'}
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {isEditingMistake ? (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm text-muted-foreground">{t.editor?.mistakeStatus || '作答状态'}</label>
                                            <Select
                                                value={mistakeStatusInput}
                                                onValueChange={setMistakeStatusInput}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="not_attempted">{t.editor?.mistakeStatuses?.notAttempted || '不会做'}</SelectItem>
                                                    <SelectItem value="wrong_attempt">{t.editor?.mistakeStatuses?.wrongAttempt || '做错了'}</SelectItem>
                                                    <SelectItem value="unknown">{t.editor?.mistakeStatuses?.unknown || '未判断'}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-muted-foreground">{t.editor?.wrongAnswerText || '错误解答原文'}</label>
                                            <Textarea
                                                value={wrongAnswerInput}
                                                onChange={(e) => {
                                                    setWrongAnswerInput(e.target.value);
                                                    if (e.target.value.trim()) setMistakeStatusInput('wrong_attempt');
                                                }}
                                                rows={5}
                                                className="w-full font-mono text-sm"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm text-muted-foreground">{t.editor?.mistakeAnalysis || '错因分析'}</label>
                                            <Textarea
                                                value={mistakeAnalysisInput}
                                                onChange={(e) => {
                                                    setMistakeAnalysisInput(e.target.value);
                                                }}
                                                rows={8}
                                                className="w-full font-mono text-sm"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <Button size="sm" onClick={saveMistakeHandler}>
                                                <Save className="h-4 w-4 mr-1" />
                                                {t.common?.save || 'Save'}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={cancelEditingMistake}>
                                                <X className="h-4 w-4 mr-1" />
                                                {t.common?.cancel || 'Cancel'}
                                            </Button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <Badge variant={item.mistakeStatus === 'wrong_attempt' ? 'default' : 'secondary'}>
                                            {getMistakeStatusLabel(item.mistakeStatus, language)}
                                        </Badge>
                                        {item.wrongAnswerText ? (
                                            <div>
                                                <h4 className="text-sm font-semibold mb-2">{t.editor?.wrongAnswerText || '错误解答原文'}</h4>
                                                <MarkdownRenderer content={item.wrongAnswerText} />
                                            </div>
                                        ) : null}
                                        {item.mistakeAnalysis ? (
                                            <div>
                                                <h4 className="text-sm font-semibold mb-2">{t.editor?.mistakeAnalysis || '错因分析'}</h4>
                                                <MarkdownRenderer content={item.mistakeAnalysis} />
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground italic">{t.detail?.noMistakeAnalysis || '暂无错因分析'}</p>
                                        )}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                        {/* 操作按钮 */}

                    </div>
                </div>
            </div>

            {/* Image Viewer Modal */}
            {
                isImageViewerOpen && item?.originalImageUrl && (
                    <div
                        className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
                        onClick={() => setIsImageViewerOpen(false)}
                    >
                        <div className="relative max-w-7xl max-h-full">
                            <button
                                className="absolute -top-12 right-0 text-white hover:text-gray-300 text-lg font-semibold bg-black/50 px-4 py-2 rounded"
                                onClick={() => setIsImageViewerOpen(false)}
                            >
                                {t.detail?.close || '✕ Close'}
                            </button>
                            <img
                                src={item.originalImageUrl}
                                alt="Full size"
                                className="max-w-full max-h-[90vh] object-contain rounded-lg"
                                onClick={(e) => e.stopPropagation()}
                            />
                            <p className="text-center text-white/70 text-sm mt-4">
                                {t.detail?.clickOutside || 'Click outside to close'}
                            </p>
                        </div>
                    </div>
                )
            }
        </main >
    );
}
