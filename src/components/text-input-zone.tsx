"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, PenLine, Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface TextInputZoneProps {
    onSubmit: (questionText: string) => Promise<void>;
    isAnalyzing: boolean;
    defaultNotebookName?: string;
}

export function TextInputZone({ onSubmit, isAnalyzing, defaultNotebookName }: TextInputZoneProps) {
    const { t } = useLanguage();
    const [questionText, setQuestionText] = useState("");

    const handleSubmit = async () => {
        if (!questionText.trim()) return;
        await onSubmit(questionText.trim());
    };

    // Support Ctrl+Enter to submit
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            if (questionText.trim() && !isAnalyzing) {
                handleSubmit();
            }
        }
    };

    return (
        <Card className="border-dashed border-2 hover:border-primary/30 transition-colors">
            <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                    <PenLine className="h-5 w-5 md:h-6 md:w-6" />
                    <span className="text-sm font-medium">
                        {t.app?.textInputHint || "手动输入题目文本"}
                    </span>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="question-text">
                        {t.editor?.question || "题目内容"}
                    </Label>
                    <Textarea
                        id="question-text"
                        value={questionText}
                        onChange={(e) => setQuestionText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={
                            t.app?.textInputPlaceholder ||
                            "在此粘贴或输入题目文本...\n支持 Markdown 和 LaTeX 公式（如 $x^2 + y^2 = 1$）\n\nCtrl+Enter 快捷提交"
                        }
                        className="min-h-[200px] font-mono text-sm resize-y"
                        disabled={isAnalyzing}
                    />
                </div>

                {defaultNotebookName && (
                    <p className="text-xs text-muted-foreground">
                        {t.notebooks?.title || "错题本"}: {defaultNotebookName}
                    </p>
                )}

                <Button
                    onClick={handleSubmit}
                    disabled={!questionText.trim() || isAnalyzing}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium"
                    size="lg"
                >
                    {isAnalyzing ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 md:h-6 md:w-6 animate-spin" />
                            {t.editor?.reanswering || "AI 解题中..."}
                        </>
                    ) : (
                        <>
                            <Sparkles className="mr-2 h-4 w-4 md:h-6 md:w-6" />
                            {t.app?.aiSolve || "AI 解题"}
                        </>
                    )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                    {t.app?.textInputTip || "输入题目后，AI 将自动解答并生成解析"}
                </p>
            </CardContent>
        </Card>
    );
}
