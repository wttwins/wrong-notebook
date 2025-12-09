"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppConfig } from "@/types/api";
import { DEFAULT_ANALYZE_TEMPLATE, DEFAULT_SIMILAR_TEMPLATE } from "@/lib/ai/prompts";
import { RotateCcw, AlertTriangle, Info } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface PromptSettingsProps {
    config: AppConfig;
    onUpdate: (type: 'analyze' | 'similar', value: string) => void;
}

interface VariableInfoProps {
    name: string;
    description: string;
}

function VariableInfo({ name, description }: VariableInfoProps) {
    return (
        <div className="flex items-start space-x-2 text-xs">
            <code className="bg-muted px-1 py-0.5 rounded font-mono text-primary flex-shrink-0">{`{{${name}}}`}</code>
            <span className="text-muted-foreground">{description}</span>
        </div>
    );
}

export function PromptSettings({ config, onUpdate }: PromptSettingsProps) {
    const { language } = useLanguage();
    const [analyzeTemplate, setAnalyzeTemplate] = useState("");
    const [similarTemplate, setSimilarTemplate] = useState("");

    useEffect(() => {
        setAnalyzeTemplate(config.prompts?.analyze || DEFAULT_ANALYZE_TEMPLATE);
        setSimilarTemplate(config.prompts?.similar || DEFAULT_SIMILAR_TEMPLATE);
    }, [config.prompts]);

    const handleReset = (type: 'analyze' | 'similar') => {
        if (!confirm(language === 'zh' ? "确定要恢复默认提示词吗？" : "Are you sure you want to reset to default?")) return;

        const defaultValue = type === 'analyze' ? DEFAULT_ANALYZE_TEMPLATE : DEFAULT_SIMILAR_TEMPLATE;
        if (type === 'analyze') {
            setAnalyzeTemplate(defaultValue);
            onUpdate('analyze', defaultValue);
        } else {
            setSimilarTemplate(defaultValue);
            onUpdate('similar', defaultValue);
        }
    };

    const handleChange = (type: 'analyze' | 'similar', value: string) => {
        if (type === 'analyze') {
            setAnalyzeTemplate(value);
            onUpdate('analyze', value);
        } else {
            setSimilarTemplate(value);
            onUpdate('similar', value);
        }
    };

    const WarningBox = () => (
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 flex items-start gap-3 text-amber-900 text-sm mb-4">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="space-y-1">
                <p className="font-medium">
                    {language === 'zh' ? "请谨慎修改" : "Modify with Caution"}
                </p>
                <p className="text-amber-800/90 text-xs">
                    {language === 'zh'
                        ? "提示词中的变量（{{...}}）用于注入动态内容。请务必保留这些变量，否则 AI 可能无法获取题目信息或生成错误的格式。"
                        : "Variables in {{brackets}} are used to inject dynamic content. Please preserve these variables, otherwise the AI providing may fail to get question context or return invalid formats."}
                </p>
            </div>
        </div>
    );

    return (
        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <Tabs defaultValue="analyze" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="analyze">
                        {language === 'zh' ? "题目分析提示词" : "Analysis Prompt"}
                    </TabsTrigger>
                    <TabsTrigger value="similar">
                        {language === 'zh' ? "举一反三提示词" : "Similar Question Prompt"}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="analyze" className="space-y-4 py-4">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <Label className="text-base font-semibold">
                                {language === 'zh' ? "自定义分析提示词模板" : "Custom Analysis Template"}
                            </Label>
                            <Button variant="outline" size="sm" onClick={() => handleReset('analyze')}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                {language === 'zh' ? "恢复默认" : "Reset Default"}
                            </Button>
                        </div>

                        <WarningBox />

                        <div className="space-y-2 border rounded-md p-3 bg-background">
                            <h4 className="text-xs font-medium flex items-center gap-1.5 mb-2">
                                <Info className="h-3.5 w-3.5" />
                                {language === 'zh' ? "可用变量说明" : "Available Variables"}
                            </h4>
                            <div className="space-y-1.5">
                                <VariableInfo
                                    name="language_instruction"
                                    description={language === 'zh' ? "根据目标语言注入格式指令（例如：英文题目用英文回答，分析用中文）。" : "Injects instructions based on target language (e.g., keep English questions in English but analysis in Chinese)."}
                                />
                                <VariableInfo
                                    name="knowledge_points_list"
                                    description={language === 'zh' ? "根据科目自动注入对应的标准知识点列表（数学、物理等），帮助 AI 准确分类。" : "Injects the standard list of knowledge point tags for the specific subject."}
                                />
                                <VariableInfo
                                    name="provider_hints"
                                    description={language === 'zh' ? "系统自动注入的补充指令（如强制 JSON 格式）。" : "System-injected hints (e.g., enforcing JSON format)."}
                                />
                            </div>
                        </div>

                        <Textarea
                            value={analyzeTemplate}
                            onChange={(e) => handleChange('analyze', e.target.value)}
                            className="font-mono text-xs min-h-[400px]"
                            placeholder={DEFAULT_ANALYZE_TEMPLATE}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="similar" className="space-y-4 py-4">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <Label className="text-base font-semibold">
                                {language === 'zh' ? "自定义举一反三模板" : "Custom Similar Question Template"}
                            </Label>
                            <Button variant="outline" size="sm" onClick={() => handleReset('similar')}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                {language === 'zh' ? "恢复默认" : "Reset Default"}
                            </Button>
                        </div>

                        <WarningBox />

                        <div className="space-y-2 border rounded-md p-3 bg-background">
                            <h4 className="text-xs font-medium flex items-center gap-1.5 mb-2">
                                <Info className="h-3.5 w-3.5" />
                                {language === 'zh' ? "可用变量说明" : "Available Variables"}
                            </h4>
                            <div className="space-y-1.5">
                                <VariableInfo
                                    name="difficulty_level"
                                    description={language === 'zh' ? "目标难度等级（Easy / Medium / Hard）。" : "Target difficulty level."}
                                />
                                <VariableInfo
                                    name="difficulty_instruction"
                                    description={language === 'zh' ? "针对该难度的具体编写要求。" : "Specific writing instructions for the target difficulty."}
                                />
                                <VariableInfo
                                    name="original_question"
                                    description={language === 'zh' ? "原始错题的完整文本。" : "The full text of the original question."}
                                />
                                <VariableInfo
                                    name="knowledge_points"
                                    description={language === 'zh' ? "需要考察的知识点列表。" : "List of knowledge points to test."}
                                />
                                <VariableInfo
                                    name="language_instruction"
                                    description={language === 'zh' ? "语言格式指令。" : "Language formatting instructions."}
                                />
                            </div>
                        </div>

                        <Textarea
                            value={similarTemplate}
                            onChange={(e) => handleChange('similar', e.target.value)}
                            className="font-mono text-xs min-h-[400px]"
                            placeholder={DEFAULT_SIMILAR_TEMPLATE}
                        />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
