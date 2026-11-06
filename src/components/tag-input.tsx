"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api-client";
import { TagSuggestionsResponse } from "@/types/api";

interface TagInputProps {
    value: string[];
    onChange: (tags: string[]) => void;
    placeholder?: string;
    className?: string;
    enterHint?: string;
    subject?: string; // 新增：用于过滤标签建议的学科
    gradeStage?: string; // 新增：用于过滤标签建议的学段 (primary, junior_high, senior_high)
}

export function TagInput({ value = [], onChange, placeholder = "Enter tags...", className = "", enterHint, subject, gradeStage }: TagInputProps) {
    const [input, setInput] = useState("");
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // 获取标签建议
    useEffect(() => {
        if (input.trim()) {
            fetchSuggestions(input);
        } else {
            setSuggestions([]);
            setShowSuggestions(false);
        }
    }, [input, subject, gradeStage]);

    const fetchSuggestions = async (query: string) => {
        try {
            // 从服务器获取标签建议（现在从数据库查询）
            const params = new URLSearchParams({ q: query });
            if (subject) {
                params.append('subject', subject);
            }
            if (gradeStage) {
                params.append('stage', gradeStage);
            }
            const data = await apiClient.get<TagSuggestionsResponse>(`/api/tags/suggestions?${params.toString()}`);
            const serverSuggestions = data.suggestions || [];

            // 过滤已选中的标签
            const filtered = serverSuggestions.filter(
                (tag) => !value.includes(tag)
            );

            setSuggestions(filtered.slice(0, 20));
            setShowSuggestions(filtered.length > 0);
            setSelectedIndex(0);
        } catch (error) {
            console.error("Failed to fetch suggestions:", error);
        }
    };

    const addTag = (tag: string) => {
        if (tag.trim() && !value.includes(tag.trim())) {
            onChange([...value, tag.trim()]);
            setInput("");
            setSuggestions([]);
            setShowSuggestions(false);
            setSelectedIndex(0);
        }
    };

    const removeTag = (tagToRemove: string) => {
        onChange(value.filter((tag) => tag !== tagToRemove));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                addTag(suggestions[selectedIndex]);
            } else if (input.trim()) {
                addTag(input);
            }
        } else if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => Math.max(prev - 1, 0));
        } else if (e.key === "Escape") {
            setShowSuggestions(false);
            setSelectedIndex(0);
        } else if (e.key === "Backspace" && !input && value.length > 0) {
            removeTag(value[value.length - 1]);
        }
    };

    // 点击外部关闭建议列表
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                suggestionsRef.current &&
                !suggestionsRef.current.contains(event.target as Node) &&
                !inputRef.current?.contains(event.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className={`relative ${className}`}>
            {/* 标签显示区域 */}
            <div className="flex flex-wrap gap-2 p-2 border rounded-lg bg-background min-h-[42px]">
                {value.map((tag) => (
                    <Badge key={tag} variant="secondary" className="flex items-center gap-1 px-2 py-1">
                        {tag}
                        <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="hover:text-destructive ml-1"
                        >
                            <X className="h-3 w-3 md:h-5 md:w-5" />
                        </button>
                    </Badge>
                ))}

                {/* 输入框 */}
                <Input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => {
                        if (suggestions.length > 0) {
                            setShowSuggestions(true);
                        }
                    }}
                    placeholder={value.length === 0 ? placeholder : ""}
                    className="flex-1 min-w-[120px] border-none focus-visible:ring-0 focus-visible:ring-offset-0 h-8 px-0"
                />
            </div>

            {/* 建议列表 */}
            {showSuggestions && suggestions.length > 0 && (
                <div
                    ref={suggestionsRef}
                    className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto"
                >
                    {suggestions.map((suggestion, index) => (
                        <div
                            key={suggestion}
                            className={`px-3 py-2 cursor-pointer hover:bg-accent ${index === selectedIndex ? "bg-accent" : ""
                                }`}
                            onClick={() => addTag(suggestion)}
                            onMouseEnter={() => setSelectedIndex(index)}
                        >
                            {suggestion}
                        </div>
                    ))}
                </div>
            )}

            {/* 提示文本 */}
            {input && !showSuggestions && (
                <div className="text-xs text-muted-foreground mt-1">
                    {enterHint ? `${enterHint} "${input}"` : `Press Enter to create "${input}"`}
                </div>
            )}
        </div>
    );
}
