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

interface ErrorItemDetail {
    id: string;
    questionText: string;
    answerText: string;
    analysis: string;
    knowledgePoints: string;
    masteryLevel: number;
    originalImageUrl: string;
    userNotes: string | null;
}

export default function ErrorDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { t, language } = useLanguage();
    const [item, setItem] = useState<ErrorItemDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [isEditingNotes, setIsEditingNotes] = useState(false);
    const [notesInput, setNotesInput] = useState("");

    useEffect(() => {
        if (params.id) {
            fetchItem(params.id as string);
        }
    }, [params.id]);

    const fetchItem = async (id: string) => {
        try {
            const res = await fetch(`/api/error-items/${id}`);
            if (res.ok) {
                const data = await res.json();
                setItem(data);
            } else {
                alert(language === 'zh' ? '加载失败' : 'Failed to load item');
                router.push("/notebook");
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const toggleMastery = async () => {
        if (!item) return;

        const newLevel = item.masteryLevel > 0 ? 0 : 1;

        try {
            const res = await fetch(`/api/error-items/${item.id}/mastery`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ masteryLevel: newLevel }),
            });

            if (res.ok) {
                setItem({ ...item, masteryLevel: newLevel });
                alert(newLevel > 0 ? (language === 'zh' ? '已标记为已掌握' : 'Marked as mastered') : (language === 'zh' ? '已取消掌握标记' : 'Unmarked'));
            } else {
                alert(language === 'zh' ? '更新失败' : 'Update failed');
            }
        } catch (error) {
            console.error(error);
            alert(language === 'zh' ? '更新出错' : 'Error updating');
        }
    };

    const deleteItem = async () => {
        if (!item) return;

        const confirmMessage = language === 'zh' ? '确定要删除这道错题吗？' : 'Are you sure you want to delete this error item?';
        if (!confirm(confirmMessage)) return;

        try {
            const res = await fetch(`/api/error-items/${item.id}/delete`, {
                method: 'DELETE',
            });

            if (res.ok) {
                alert(language === 'zh' ? '删除成功' : 'Deleted successfully');
                router.push('/notebook');
            } else {
                alert(language === 'zh' ? '删除失败' : 'Delete failed');
            }
        } catch (error) {
            console.error(error);
            alert(language === 'zh' ? '删除出错' : 'Error deleting');
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

    const saveNotes = async () => {
        if (!item) return;

        try {
            const res = await fetch(`/api/error-items/${item.id}/notes`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userNotes: notesInput }),
            });

            if (res.ok) {
                setItem({ ...item, userNotes: notesInput });
                setIsEditingNotes(false);
                alert(language === 'zh' ? '笔记保存成功' : 'Notes saved successfully');
            } else {
                alert(language === 'zh' ? '保存失败' : 'Save failed');
            }
        } catch (error) {
            console.error(error);
            alert(language === 'zh' ? '保存出错' : 'Error saving');
        }
    };

    if (loading) return <div className="p-8 text-center">{t.common.loading}</div>;
    if (!item) return <div className="p-8 text-center">{t.detail.notFound || "Item not found"}</div>;

    let tags: string[] = [];
    try {
        tags = JSON.parse(item.knowledgePoints);
    } catch (e) {
        tags = [];
    }

    return (
        <main className="min-h-screen p-8 bg-background">
            <div className="max-w-4xl mx-auto space-y-6">
                <div className="flex items-center gap-4">
                    <Link href="/notebook">
                        <Button variant="ghost" size="icon">
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                    </Link>
                    <h1 className="text-2xl font-bold">{t.detail.title}</h1>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                    {/* Left Column: Question & Image */}
                    <div className="space-y-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>{t.detail.question}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="p-4 bg-muted rounded-lg whitespace-pre-wrap">
                                    {item.questionText}
                                </div>
                                {item.originalImageUrl && (
                                    <div>
                                        <p className="text-sm font-medium mb-2">{t.detail.originalProblem || "Original Problem"}</p>
                                        <img
                                            src={item.originalImageUrl}
                                            alt={t.detail.originalProblem || "Original Problem"}
                                            className="w-full rounded-lg border"
                                        />
                                    </div>
                                )}
                                <div className="flex flex-wrap gap-2">
                                    {tags.map((tag) => (
                                        <Badge key={tag} variant="secondary">
                                            {tag}
                                        </Badge>
                                    ))}
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
                                            {t.detail.editNotes || "编辑"}
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
                                            placeholder={t.detail.notesPlaceholder || "输入你的笔记..."}
                                            rows={5}
                                            className="w-full"
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                onClick={saveNotes}
                                            >
                                                <Save className="h-4 w-4 mr-1" />
                                                {t.common.save || "保存"}
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={cancelEditingNotes}
                                            >
                                                <X className="h-4 w-4 mr-1" />
                                                {t.common.cancel || "取消"}
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
                    <div className="space-y-6">
                        <Card className="border-primary/20">
                            <CardHeader>
                                <CardTitle className="text-primary">{t.detail.correctAnswer}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="font-medium text-lg">{item.answerText}</div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader>
                                <CardTitle>{t.detail.analysis}</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="whitespace-pre-wrap text-muted-foreground">
                                    {item.analysis}
                                </div>
                            </CardContent>
                        </Card>

                        <div className="flex justify-between items-center gap-3">
                            <Button
                                variant="destructive"
                                size="lg"
                                onClick={deleteItem}
                            >
                                <Trash2 className="mr-2 h-5 w-5" />
                                {t.detail.delete || "删除"}
                            </Button>

                            <div className="flex gap-3">
                                <Link href={`/practice?id=${item.id}`}>
                                    <Button variant="secondary" size="lg">
                                        <RefreshCw className="mr-2 h-5 w-5" />
                                        {t.detail.practice}
                                    </Button>
                                </Link>
                                <Button
                                    size="lg"
                                    variant={item.masteryLevel > 0 ? "outline" : "default"}
                                    className={item.masteryLevel > 0 ? "text-green-600 border-green-600" : ""}
                                    onClick={toggleMastery}
                                >
                                    {item.masteryLevel > 0 ? (
                                        <>
                                            <CheckCircle className="mr-2 h-5 w-5" />
                                            {t.detail.mastered}
                                        </>
                                    ) : (
                                        <>
                                            <XCircle className="mr-2 h-5 w-5" />
                                            {t.detail.markMastered}
                                        </>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
