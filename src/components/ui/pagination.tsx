"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { MAX_VISIBLE_PAGES } from "@/lib/constants/pagination";

interface PaginationProps {
    page: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    total?: number;
    pageSize?: number;
}

export function Pagination({
    page,
    totalPages,
    onPageChange,
    total,
    pageSize,
}: PaginationProps) {
    const { t } = useLanguage();

    if (totalPages <= 1) return null;

    const canGoPrev = page > 1;
    const canGoNext = page < totalPages;

    // 生成页码按钮（最多显示 MAX_VISIBLE_PAGES 个）
    const getPageNumbers = () => {
        const pages: (number | "ellipsis")[] = [];

        if (totalPages <= MAX_VISIBLE_PAGES) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            // 始终显示第一页
            pages.push(1);

            if (page > 3) pages.push("ellipsis");

            // 中间页码
            const start = Math.max(2, page - 1);
            const end = Math.min(totalPages - 1, page + 1);
            for (let i = start; i <= end; i++) pages.push(i);

            if (page < totalPages - 2) pages.push("ellipsis");

            // 始终显示最后一页
            pages.push(totalPages);
        }

        return pages;
    };

    const pageNumbers = getPageNumbers();

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4">
            {total !== undefined && pageSize !== undefined && (
                <div className="text-sm text-muted-foreground order-2 sm:order-1">
                    {(t.pagination?.showing || "Showing {start}-{end} of {total}")
                        .replace("{start}", ((page - 1) * pageSize + 1).toString())
                        .replace("{end}", Math.min(page * pageSize, total).toString())
                        .replace("{total}", total.toString())}
                </div>
            )}
            <div className="flex items-center gap-1 order-1 sm:order-2">
                {/* 首页 */}
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onPageChange(1)}
                    disabled={!canGoPrev}
                    title={t.pagination?.first || "First page"}
                >
                    <ChevronsLeft className="h-4 w-4 md:h-6 md:w-6" />
                </Button>

                {/* 上一页 */}
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onPageChange(page - 1)}
                    disabled={!canGoPrev}
                    title={t.pagination?.prev || "Previous page"}
                >
                    <ChevronLeft className="h-4 w-4 md:h-6 md:w-6" />
                </Button>

                {/* 页码 */}
                <div className="hidden sm:flex items-center gap-1">
                    {pageNumbers.map((pageNum, idx) =>
                        pageNum === "ellipsis" ? (
                            <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">
                                ...
                            </span>
                        ) : (
                            <Button
                                key={pageNum}
                                variant={pageNum === page ? "default" : "outline"}
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => onPageChange(pageNum)}
                            >
                                {pageNum}
                            </Button>
                        )
                    )}
                </div>

                {/* 移动端显示当前页/总页数 */}
                <span className="sm:hidden text-sm px-2">
                    {page} / {totalPages}
                </span>

                {/* 下一页 */}
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onPageChange(page + 1)}
                    disabled={!canGoNext}
                    title={t.pagination?.next || "Next page"}
                >
                    <ChevronRight className="h-4 w-4 md:h-6 md:w-6" />
                </Button>

                {/* 末页 */}
                <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onPageChange(totalPages)}
                    disabled={!canGoNext}
                    title={t.pagination?.last || "Last page"}
                >
                    <ChevronsRight className="h-4 w-4 md:h-6 md:w-6" />
                </Button>
            </div>
        </div>
    );
}
