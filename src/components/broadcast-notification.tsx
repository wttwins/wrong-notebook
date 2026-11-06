"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLanguage } from "@/contexts/LanguageContext";

export function BroadcastNotification() {
    const { t } = useLanguage();
    const [hasUnread, setHasUnread] = useState(true);

    const handleOpen = () => {
        // 打开后标记为已读
        setHasUnread(false);
    };

    return (
        <DropdownMenu onOpenChange={(open) => open && handleOpen()}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full text-muted-foreground hover:text-primary relative"
                    title={t.broadcast?.title || "Announcements"}
                >
                    <Bell className="h-5 w-5 md:h-6 md:w-6" />
                    {/* 未读角标 */}
                    {hasUnread && (
                        <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                    )}
                    <span className="sr-only">{t.broadcast?.title || "Announcements"}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                align="end"
                className="w-72 sm:w-80 p-0"
            >
                <DropdownMenuLabel className="flex items-center gap-2 px-4 py-3 bg-primary/5 border-b">
                    <Bell className="h-4 w-4 md:h-6 md:w-6 text-primary" />
                    <span className="font-semibold">{t.broadcast?.title || "Announcements"}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="m-0" />
                <div className="p-4 space-y-3">
                    {/* 广播消息 1：教育阶段提醒 */}
                    <div className="flex gap-3 items-start p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                        <div className="shrink-0 mt-0.5">
                            <span className="text-amber-500 text-lg">📢</span>
                        </div>
                        <div className="space-y-1 text-sm">
                            <p className="text-foreground leading-relaxed">
                                {t.broadcast?.profileReminder || "Please make sure to correctly fill in your education stage and enrollment year in Settings -> Account to ensure tags are associated correctly."}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {t.broadcast?.settingsPath || "Settings -> Account"}
                            </p>
                        </div>
                    </div>

                    {/* 广播消息 2：标签库迁移提醒 */}
                    <div className="flex gap-3 items-start p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                        <div className="shrink-0 mt-0.5">
                            <span className="text-blue-500 text-lg">🔧</span>
                        </div>
                        <div className="space-y-1 text-sm">
                            <p className="text-foreground leading-relaxed">
                                {t.broadcast?.tagMigrationReminder || "If the standard tag library fails to load, please use an admin account to reset it."}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {t.broadcast?.settingsPath2 || "Settings -> Danger -> Tag System Migration"}
                            </p>
                        </div>
                    </div>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
