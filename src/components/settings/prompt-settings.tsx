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
        <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2 text-xs py-1">
            <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary shrink-0 w-fit">{`{{${name}}}`}</code>
            <span className="text-muted-foreground">{description}</span>
        </div>
    );
}

export function PromptSettings({ config, onUpdate }: PromptSettingsProps) {
    const { language, t } = useLanguage();
    const [analyzeTemplate, setAnalyzeTemplate] = useState("");
    const [similarTemplate, setSimilarTemplate] = useState("");

    useEffect(() => {
        setAnalyzeTemplate(config.prompts?.analyze || DEFAULT_ANALYZE_TEMPLATE);
        setSimilarTemplate(config.prompts?.similar || DEFAULT_SIMILAR_TEMPLATE);
    }, [config.prompts]);

    const handleReset = (type: 'analyze' | 'similar') => {
        if (!confirm(t.settings?.prompts?.resetConfirm || "Are you sure you want to reset to default?")) return;

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
            <AlertTriangle className="h-5 w-5 md:h-6 md:w-6 shrink-0 text-amber-600" />
            <div className="space-y-1">
                <p className="font-medium">
                    {t.settings?.prompts?.caution || "Modify with Caution"}
                </p>
                <p className="text-amber-800/90 text-xs">
                    {t.settings?.prompts?.warning || "Variables in {{brackets}} are used to inject dynamic content. Please preserve these variables, otherwise the AI providing may fail to get question context or return invalid formats."}
                </p>
            </div>
        </div>
    );

    return (
        <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
            <Tabs defaultValue="analyze" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="analyze">
                        {t.settings?.prompts?.analysisTab || "Analysis Prompt"}
                    </TabsTrigger>
                    <TabsTrigger value="similar">
                        {t.settings?.prompts?.similarTab || "Similar Question Prompt"}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="analyze" className="space-y-4 py-4">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <Label className="text-base font-semibold">
                                {t.settings?.prompts?.customAnalysis || "Custom Analysis Template"}
                            </Label>
                            <Button variant="outline" size="sm" onClick={() => handleReset('analyze')}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                {t.settings?.prompts?.reset || "Reset Default"}
                            </Button>
                        </div>

                        <WarningBox />

                        <div className="space-y-2 border rounded-md p-3 bg-background">
                            <h4 className="text-xs font-medium flex items-center gap-1.5 mb-2">
                                <Info className="h-3.5 w-3.5 md:h-6 md:w-6" />
                                {t.settings?.prompts?.variables || "Available Variables"}
                            </h4>
                            <div className="space-y-1.5">
                                <VariableInfo
                                    name="language_instruction"
                                    description={t.settings?.prompts?.vars?.languageInstruction || "Injects instructions based on target language (e.g., keep English questions in English but analysis in Chinese)."}
                                />
                                <VariableInfo
                                    name="knowledge_points_list"
                                    description={t.settings?.prompts?.vars?.knowledgePointsList || "Injects the standard list of knowledge point tags for the specific subject."}
                                />
                                <VariableInfo
                                    name="provider_hints"
                                    description={t.settings?.prompts?.vars?.providerHints || "System-injected hints (e.g., enforcing JSON format)."}
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
                                {t.settings?.prompts?.customSimilar || "Custom Similar Question Template"}
                            </Label>
                            <Button variant="outline" size="sm" onClick={() => handleReset('similar')}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                {t.settings?.prompts?.reset || "Reset Default"}
                            </Button>
                        </div>

                        <WarningBox />

                        <div className="space-y-2 border rounded-md p-3 bg-background">
                            <h4 className="text-xs font-medium flex items-center gap-1.5 mb-2">
                                <Info className="h-3.5 w-3.5 md:h-6 md:w-6" />
                                {t.settings?.prompts?.variables || "Available Variables"}
                            </h4>
                            <div className="space-y-1.5">
                                <VariableInfo
                                    name="difficulty_level"
                                    description={t.settings?.prompts?.vars?.difficultyLevel || "Target difficulty level."}
                                />
                                <VariableInfo
                                    name="difficulty_instruction"
                                    description={t.settings?.prompts?.vars?.difficultyInstruction || "Specific writing instructions for the target difficulty."}
                                />
                                <VariableInfo
                                    name="original_question"
                                    description={t.settings?.prompts?.vars?.originalQuestion || "The full text of the original question."}
                                />
                                <VariableInfo
                                    name="knowledge_points"
                                    description={t.settings?.prompts?.vars?.knowledgePoints || "List of knowledge points to test."}
                                />
                                <VariableInfo
                                    name="language_instruction"
                                    description={t.settings?.prompts?.vars?.languageInstructionShort || "Language formatting instructions."}
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
