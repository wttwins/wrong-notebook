"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Plus, House } from "lucide-react";
import Link from "next/link";
import { NotebookCard } from "@/components/notebook-card";
import { CreateNotebookDialog } from "@/components/create-notebook-dialog";
import { RenameNotebookDialog } from "@/components/rename-notebook-dialog";

import { Notebook } from "@/types/api";
import { apiClient } from "@/lib/api-client";

import { useLanguage } from "@/contexts/LanguageContext";

// ... imports

export default function NotebooksPage() {
    const router = useRouter();
    const { t } = useLanguage(); // Use hook
    const [notebooks, setNotebooks] = useState<Notebook[]>([]);
    const [loading, setLoading] = useState(true);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [renameTarget, setRenameTarget] = useState<Notebook | null>(null);

    useEffect(() => {
        fetchNotebooks();
    }, []);

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

    const handleCreate = async (name: string) => {
        try {
            await apiClient.post("/api/notebooks", { name });
            await fetchNotebooks();
        } catch (error: any) {
            console.error(error);
            const message = error.data?.message || t.notebooks?.createError || "Failed to create";
            alert(message);
        }
    };

    const handleRename = async (name: string) => {
        if (!renameTarget) return;
        await apiClient.put(`/api/notebooks/${renameTarget.id}`, { name });
        setRenameTarget(null);
        await fetchNotebooks();
    };

    const handleDelete = async (id: string, errorCount: number, name: string) => {
        if (errorCount > 0) {
            alert(t.notebooks?.deleteNotEmpty || "Please clear all items in this notebook first.");
            return;
        }
        if (!confirm((t.notebooks?.deleteConfirm || "Are you sure?").replace("{name}", name))) return;

        try {
            await apiClient.delete(`/api/notebooks/${id}`);
            await fetchNotebooks();
        } catch (error: any) {
            console.error(error);
            const message = error.data?.message || t.notebooks?.deleteError || "Failed to delete";
            alert(message);
        }
    };

    const handleNotebookClick = (id: string) => {
        router.push(`/notebooks/${id}`);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-muted-foreground">{t.common.loading}</p>
            </div>
        );
    }

    return (
        <main className="min-h-screen p-4 md:p-8 bg-background">
            <div className="max-w-6xl mx-auto space-y-8">
                <div className="flex items-start gap-4">
                    <BackButton fallbackUrl="/" />
                    <div className="flex-1 space-y-1">
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.notebooks?.title || "My Notebooks"}</h1>
                        <p className="text-muted-foreground text-sm sm:text-base">
                            {t.notebooks?.subtitle || "Manage your mistakes by subject"}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <Button onClick={() => setDialogOpen(true)} size="sm" className="hidden sm:flex">
                            <Plus className="mr-2 h-4 w-4" />
                            {t.notebooks?.create || "New Notebook"}
                        </Button>
                        <Button onClick={() => setDialogOpen(true)} size="icon" className="sm:hidden">
                            <Plus className="h-4 w-4" />
                        </Button>
                        <Link href="/">
                            <Button variant="ghost" size="icon">
                                <House className="h-5 w-5" />
                            </Button>
                        </Link>
                    </div>
                </div>

                {notebooks.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed rounded-lg">
                        <p className="text-muted-foreground mb-4">
                            {t.notebooks?.empty || "No notebooks yet."}
                        </p>
                        <Button onClick={() => setDialogOpen(true)}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t.notebooks?.createFirst || "Create Notebook"}
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {notebooks.map((notebook) => (
                            <NotebookCard
                                key={notebook.id}
                                id={notebook.id}
                                name={notebook.name}
                                errorCount={notebook._count?.errorItems || 0}
                                onClick={() => handleNotebookClick(notebook.id)}
                                onRename={() => setRenameTarget(notebook)}
                                onDelete={() => handleDelete(notebook.id, notebook._count?.errorItems || 0, notebook.name)}
                                itemLabel={t.notebooks?.items || "items"}
                            />
                        ))}
                    </div>
                )}

                <CreateNotebookDialog
                    key={t.common.loading} // Force re-render when language changes
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                    onCreate={handleCreate}
                />

                <RenameNotebookDialog
                    open={!!renameTarget}
                    onOpenChange={(open) => { if (!open) setRenameTarget(null); }}
                    currentName={renameTarget?.name || ""}
                    onRename={handleRename}
                />
            </div >
        </main >
    );
}
