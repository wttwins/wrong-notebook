"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, CheckCircle, Eye, Send, XCircle } from "lucide-react";
import { ParsedQuestion } from "@/lib/gemini";
import { useLanguage } from "@/contexts/LanguageContext";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

export default function PracticePage() {
    const searchParams = useSearchParams();
    const errorItemId = searchParams.get("id");
    const { t, language } = useLanguage();

    const [question, setQuestion] = useState<ParsedQuestion | null>(null);
    const [loading, setLoading] = useState(false);
    const [showAnswer, setShowAnswer] = useState(false);
    const [userAnswer, setUserAnswer] = useState("");
    const [notes, setNotes] = useState("");
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);

    const generateQuestion = async () => {
        if (!errorItemId) return;

        setLoading(true);
        setUserAnswer("");
        setNotes("");
        setIsSubmitted(false);
        setIsCorrect(null);
        setShowAnswer(false);
        try {
            const res = await fetch("/api/practice/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ errorItemId, language }),
            });

            if (res.ok) {
                const data = await res.json();
                setQuestion(data);
            } else {
                alert(language === 'zh' ? '生成失败' : 'Failed to generate question');
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const submitAnswer = () => {
        if (!userAnswer.trim() || !question) return;

        setIsSubmitted(true);
        // Simple comparison - could be enhanced with AI
        const correct = userAnswer.trim().toLowerCase() === question.answerText.trim().toLowerCase();
        setIsCorrect(correct);
        setShowAnswer(true);
    };

    if (!errorItemId) {
        return <div className="p-8 text-center">{t.practice.invalidRequest || "Invalid Request"}</div>;
    }

    return (
        <main className="min-h-screen p-8 bg-background">
            <div className="max-w-3xl mx-auto space-y-8">
                <div className="text-center space-y-4">
                    <h1 className="text-3xl font-bold">{t.practice.title}</h1>
                    <p className="text-muted-foreground">
                        {t.practice.subtitle}
                    </p>

                    {!question && (
                        <Button size="lg" onClick={generateQuestion} disabled={loading}>
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t.practice.generating}
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    {t.practice.generate}
                                </>
                            )}
                        </Button>
                    )}
                </div>

                {question && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <Card className="border-primary/50 shadow-lg">
                            <CardHeader>
                                <CardTitle className="flex justify-between items-center">
                                    <span>{t.practice.practiceProblem}</span>
                                    <Button variant="ghost" size="sm" onClick={generateQuestion} disabled={loading}>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        {t.practice.regenerate}
                                    </Button>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-lg whitespace-pre-wrap font-medium">
                                    {question.questionText}
                                </div>
                            </CardContent>
                        </Card>


                        {/* Answer Input Section */}
                        <Card className="border-blue-200">
                            <CardHeader>
                                <CardTitle className="text-blue-600">
                                    {t.practice.yourAnswer || "你的答案"}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <Input
                                    placeholder={t.practice.answerPlaceholder || "输入你的答案..."}
                                    value={userAnswer}
                                    onChange={(e) => setUserAnswer(e.target.value)}
                                    disabled={isSubmitted}
                                    className="text-lg"
                                />
                                <Textarea
                                    placeholder={t.practice.notesPlaceholder || "记录解题思路（可选）..."}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    disabled={isSubmitted}
                                    rows={3}
                                />
                            </CardContent>
                        </Card>

                        {/* Submit/Result Section */}
                        {!isSubmitted ? (
                            <div className="flex justify-center">
                                <Button
                                    size="lg"
                                    onClick={submitAnswer}
                                    disabled={!userAnswer.trim()}
                                    className="w-full md:w-auto"
                                >
                                    <Send className="mr-2 h-4 w-4" />
                                    {t.practice.submitAnswer || "提交答案"}
                                </Button>
                            </div>
                        ) : (
                            <Card className={isCorrect ? "border-green-500 bg-green-50" : "border-red-500 bg-red-50"}>
                                <CardContent className="pt-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        {isCorrect ? (
                                            <>
                                                <CheckCircle className="h-8 w-8 text-green-600" />
                                                <div>
                                                    <h3 className="text-xl font-bold text-green-600">
                                                        {t.practice.correct || "回答正确！"}
                                                    </h3>
                                                    <p className="text-green-700">
                                                        {t.practice.correctMessage || "太棒了，继续保持！"}
                                                    </p>
                                                </div>
                                            </>
                                        ) : (
                                            <>
                                                <XCircle className="h-8 w-8 text-red-600" />
                                                <div>
                                                    <h3 className="text-xl font-bold text-red-600">
                                                        {t.practice.incorrect || "答案有误"}
                                                    </h3>
                                                    <p className="text-red-700">
                                                        {t.practice.incorrectMessage || "再看看解析，加油！"}
                                                    </p>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    {notes && (
                                        <div className="mt-4 p-3 bg-white rounded-lg border">
                                            <p className="text-sm font-medium text-gray-600 mb-1">
                                                {t.practice.yourNotes || "你的笔记："}
                                            </p>
                                            <p className="text-gray-700 whitespace-pre-wrap">{notes}</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {showAnswer && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
                                <Card className="bg-muted/50">
                                    <CardHeader>
                                        <CardTitle className="text-green-600">{t.practice.correctAnswer}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-xl font-bold">{question.answerText}</div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>{t.practice.detailedAnalysis}</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="whitespace-pre-wrap text-muted-foreground">
                                            {question.analysis}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}
