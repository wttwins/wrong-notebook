"use client";

import { useEffect, useState } from "react";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { BookOpen } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { Notebook } from "@/types/api";
import { useLanguage } from "@/contexts/LanguageContext";

interface NotebookSelectorProps {
    value?: string;
    onChange: (value: string) => void;
    className?: string;
}

export function NotebookSelector({ value, onChange, className }: NotebookSelectorProps) {
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [loading, setLoading] = useState(true);
    const { t } = useLanguage();

    useEffect(() => {
        const fetchNotebooks = async () => {
            try {
                const data = await apiClient.get<Notebook[]>("/api/notebooks");
                setNotebooks(data);
            } catch (error) {
                console.error("Failed to fetch notebooks:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchNotebooks();
    }, []);

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger className={className}>
                <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                    <SelectValue placeholder={t.notebooks?.selector?.placeholder || "Select Notebook"} />
                </div>
            </SelectTrigger>
            <SelectContent>
                {notebooks.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                        {t.notebooks?.selector?.empty || "No notebooks available"}
                    </div>
                ) : (
                    notebooks.map((notebook) => (
                        <SelectItem key={notebook.id} value={notebook.id}>
                            {notebook.name}
                        </SelectItem>
                    ))
                )}
            </SelectContent>
        </Select>
    );
}
