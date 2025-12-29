"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, RefreshCw, CheckCircle, Eye, Send, XCircle, ArrowLeft, House } from "lucide-react";
import { ParsedQuestion } from "@/lib/ai/types";
import { useLanguage } from "@/contexts/LanguageContext";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { apiClient } from "@/lib/api-client";

export const dynamic = 'force-dynamic';

function PracticeContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const errorItemId = searchParams.get("id");
    const { t, language } = useLanguage();

    const [question, setQuestion] = useState<ParsedQuestion | null>(null);
    const [loading, setLoading] = useState(false);
    const [showAnswer, setShowAnswer] = useState(false);
    const [userAnswer, setUserAnswer] = useState("");
    const [notes, setNotes] = useState("");
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null);


    const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "harder">("medium");

    const [error, setError] = useState<string | null>(null);

    const generateQuestion = async () => {
        if (!errorItemId) return;

        setLoading(true);
        setError(null);
        setUserAnswer("");
        setNotes("");
        setIsSubmitted(false);
        setIsCorrect(null);
        setShowAnswer(false);
        try {
            const data = await apiClient.post<ParsedQuestion>("/api/practice/generate", {
                errorItemId,
                language,
                difficulty
            });
            setQuestion(data);
        } catch (error: any) {
            console.error(error);
            const msg = error.data?.message || "";

            let errorMessage = t.practice.errors?.default || "Failed to generate";

            if (msg.includes('AI_CONNECTION_FAILED')) {
                errorMessage = t.errors?.aiConnectionFailed || errorMessage;
            } else if (msg.includes('AI_RESPONSE_ERROR')) {
                errorMessage = t.errors?.aiResponseError || errorMessage;
            } else if (msg.includes('AI_AUTH_ERROR')) {
                errorMessage = t.errors?.aiAuth || errorMessage;
            } else if (msg.includes('AI_UNKNOWN_ERROR')) {
                errorMessage = t.errors?.AI_UNKNOWN_ERROR || errorMessage;
            }

            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const submitAnswer = () => {
        if (!userAnswer.trim() || !question) return;

        setIsSubmitted(true);

        const normalize = (str: string) => str.trim().toLowerCase().replace(/[.,;!]/g, '');
        const user = normalize(userAnswer);
        const correct = normalize(question.answerText);

        // Enhanced comparison logic
        let isMatch = user === correct;

        // Handle multiple choice (e.g. user enters "A" but answer is "A. some text")
        if (!isMatch && /^[a-d]$/.test(user)) {
            isMatch = correct.startsWith(user);
        }

        // Handle case where answer contains the user input (e.g. answer is "The answer is 5" and user enters "5")
        if (!isMatch && correct.includes(user) && user.length > 1) {
            isMatch = true;
        }

        setIsCorrect(isMatch);
        setShowAnswer(true);

        // Save practice record
        apiClient.post("/api/practice/record", {
            subject: question.subject || "Unknown",
            difficulty,
            isCorrect: isMatch
        }).catch(err => console.error("Failed to save practice record:", err));
    };

    if (!errorItemId) {
        return <div className="p-8 text-center">{t.practice.invalidRequest || "Invalid Request"}</div>;
    }

    return (
        <div className="max-w-3xl mx-auto space-y-8">
            <div className="flex justify-between items-center mb-4">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {t.common?.back || "返回"}
                </Button>
                <Link href="/">
                    <Button variant="ghost" size="icon">
                        <House className="h-5 w-5" />
                    </Button>
                </Link>
            </div>
            <div className="text-center space-y-4">
                <h1 className="text-3xl font-bold">{t.practice.title}</h1>
                <p className="text-muted-foreground">
                    {t.practice.subtitle}
                </p>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
                        <strong className="font-bold">{t.common?.error || "Error"}: </strong>
                        <span className="block whitespace-pre-wrap"> {error}</span>
                    </div>
                )}

                {!question && (
                    <div className="flex flex-col items-center gap-4">
                        <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-lg">
                            <span className="text-sm font-medium text-muted-foreground">{t.practice.difficulty?.label || "Difficulty"}:</span>
                            <div className="flex gap-1">
                                {[
                                    { value: "easy", label: t.practice.difficulty?.easy || "Easy", color: "bg-green-100 text-green-700 hover:bg-green-200" },
                                    { value: "medium", label: t.practice.difficulty?.medium || "Medium", color: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
                                    { value: "hard", label: t.practice.difficulty?.hard || "Hard", color: "bg-orange-100 text-orange-700 hover:bg-orange-200" },
                                    { value: "harder", label: t.practice.difficulty?.harder || "Challenge", color: "bg-red-100 text-red-700 hover:bg-red-200" }
                                ].map((level) => (
                                    <button
                                        key={level.value}
                                        onClick={() => setDifficulty(level.value as any)}
                                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${difficulty === level.value
                                            ? level.color.replace("bg-", "bg-opacity-100 bg-").replace("text-", "ring-2 ring-offset-1 ring-")
                                            : "bg-transparent hover:bg-muted text-muted-foreground"
                                            } ${difficulty === level.value ? level.color : ''}`}
                                    >
                                        {level.label}
                                    </button>
                                ))}
                            </div>
                        </div>

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
                    </div>
                )}
            </div>

            {question && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="border-primary/50 shadow-lg">
                        <CardHeader>
                            <CardTitle className="flex justify-between items-center">
                                <span>{t.app.practiceProblem}</span>
                                <div className="flex items-center gap-2">
                                    <select
                                        value={difficulty}
                                        onChange={(e) => setDifficulty(e.target.value as any)}
                                        className="h-8 text-xs border rounded px-2 bg-background"
                                        disabled={loading}
                                    >
                                        <option value="easy">{t.practice.difficulty?.easy || "Easy"}</option>
                                        <option value="medium">{t.practice.difficulty?.medium || "Medium"}</option>
                                        <option value="hard">{t.practice.difficulty?.hard || "Hard"}</option>
                                        <option value="harder">{t.practice.difficulty?.harder || "Challenge"}</option>
                                    </select>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={generateQuestion}
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                {t.practice.generating}
                                            </>
                                        ) : (
                                            <>
                                                <RefreshCw className="mr-2 h-4 w-4" />
                                                {t.practice.regenerate}
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <MarkdownRenderer content={question.questionText} className="font-medium" />
                            {/* 题目配图 */}
                            {question.questionImageUrl && (
                                <div className="mt-4">
                                    <img
                                        src={question.questionImageUrl}
                                        alt={t.practice.questionImage || "题目配图"}
                                        className="max-w-full rounded-lg border shadow-sm"
                                        loading="lazy"
                                    />
                                </div>
                            )}
                        </CardContent>
                    </Card>


                    {/* Answer Input Section */}
                    <Card className="border-blue-200">
                        <CardHeader>
                            <CardTitle className="text-blue-600">
                                {t.app.yourAnswer || "你的答案"}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <Input
                                placeholder={t.app.answerPlaceholder || "输入你的答案..."}
                                value={userAnswer}
                                onChange={(e) => setUserAnswer(e.target.value)}
                                disabled={isSubmitted}
                                className="text-lg"
                            />
                            <Textarea
                                placeholder={t.app.notesPlaceholder || "记录解题思路（可选）..."}
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
                                {t.app.submitAnswer || "提交答案"}
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
                                    <MarkdownRenderer content={question.answerText} className="font-bold" />
                                </CardContent>
                            </Card>


                            <Card>
                                <CardHeader>
                                    <CardTitle>{t.practice.detailedAnalysis}</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <MarkdownRenderer content={question.analysis} />
                                    {/* 答案/解析配图 */}
                                    {question.answerImageUrl && (
                                        <div className="mt-4">
                                            <img
                                                src={question.answerImageUrl}
                                                alt={t.practice.analysisImage || "解析配图"}
                                                className="max-w-full rounded-lg border shadow-sm"
                                                loading="lazy"
                                            />
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function PracticePage() {
    return (
        <main className="min-h-screen p-8 bg-background">
            <Suspense fallback={
                <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            }>
                <PracticeContent />
            </Suspense>
        </main>
    );
}
