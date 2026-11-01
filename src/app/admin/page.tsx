"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiClient } from "@/lib/api-client";
import { Loader2, Users, BookOpen, PenTool, Layers, TrendingUp, CheckCircle, Clock, AlertCircle, ChevronDown, ChevronUp, Eye, BarChart3, ArrowLeft, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminDashboardData, AdminUserStats } from "@/types/api";

function OverviewCards({ data, t }: { data: AdminDashboardData; t: any }) {
    const cards = [
        {
            title: t.admin?.dashboard?.totalUsers || "总用户数",
            value: data.overview.totalUsers,
            icon: Users,
            color: "text-blue-500",
            bgColor: "bg-blue-50 dark:bg-blue-950/30",
        },
        {
            title: t.admin?.dashboard?.totalErrors || "总错题数",
            value: data.overview.totalErrorItems,
            icon: BookOpen,
            color: "text-red-500",
            bgColor: "bg-red-50 dark:bg-red-950/30",
        },
        {
            title: t.admin?.dashboard?.totalPractice || "总练习数",
            value: data.overview.totalPracticeRecords,
            icon: PenTool,
            color: "text-green-500",
            bgColor: "bg-green-50 dark:bg-green-950/30",
        },
        {
            title: t.admin?.dashboard?.totalNotebooks || "总错题本数",
            value: data.overview.totalSubjects,
            icon: Layers,
            color: "text-purple-500",
            bgColor: "bg-purple-50 dark:bg-purple-950/30",
        },
    ]

    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((card) => (
                <Card key={card.title} className="border-0 shadow-sm">
                    <CardContent className="p-4 flex items-center gap-4">
                        <div className={`p-3 rounded-xl ${card.bgColor}`}>
                            <card.icon className={`h-6 w-6 ${card.color}`} />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">{card.title}</p>
                            <p className="text-2xl font-bold">{card.value}</p>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}

function DailyTrendChart({ data, t }: { data: AdminDashboardData; t: any }) {
    const maxCount = Math.max(...data.dailyTrend.map(d => d.count), 1)

    return (
        <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 md:h-6 md:w-6 text-orange-500" />
                    {t.admin?.dashboard?.recentTrend || "最近 7 天录入趋势"}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <div className="flex items-end gap-2 h-40">
                    {data.dailyTrend.map((d) => {
                        const height = maxCount > 0 ? (d.count / maxCount) * 100 : 0
                        const dateObj = new Date(d.date)
                        const label = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`
                        return (
                            <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                                <span className="text-xs font-medium">{d.count > 0 ? d.count : ""}</span>
                                <div className="w-full relative" style={{ height: "100px" }}>
                                    <div
                                        className="absolute bottom-0 w-full bg-gradient-to-t from-orange-500 to-orange-400 rounded-t-md transition-all duration-500 min-h-[4px]"
                                        style={{ height: `${Math.max(height, 4)}%` }}
                                    />
                                </div>
                                <span className="text-xs text-muted-foreground">{label}</span>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}

function SubjectDistributionChart({ data, t }: { data: AdminDashboardData; t: any }) {
    const total = data.subjectDistribution.reduce((sum, s) => sum + s.count, 0)
    const colors = [
        "bg-blue-500", "bg-green-500", "bg-orange-500", "bg-purple-500",
        "bg-red-500", "bg-cyan-500", "bg-yellow-500", "bg-pink-500", "bg-indigo-500",
    ]

    return (
        <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 md:h-6 md:w-6 text-blue-500" />
                    {t.admin?.dashboard?.subjectDistribution || "学科错题分布"}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {total === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        {t.admin?.dashboard?.noData || "暂无数据"}
                    </p>
                ) : (
                    <div className="space-y-3">
                        {data.subjectDistribution.map((s, i) => {
                            const pct = total > 0 ? Math.round((s.count / total) * 100) : 0
                            return (
                                <div key={s.name} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="font-medium">{s.name}</span>
                                        <span className="text-muted-foreground">{s.count} ({pct}%)</span>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-2.5">
                                        <div
                                            className={`h-2.5 rounded-full ${colors[i % colors.length]} transition-all duration-500`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function MasteryDistributionCard({ data, t }: { data: AdminDashboardData; t: any }) {
    const total = data.masteryDistribution.new + data.masteryDistribution.reviewing + data.masteryDistribution.mastered
    const items = [
        { key: "new", label: t.admin?.dashboard?.masteryNew || "未掌握", count: data.masteryDistribution.new, icon: AlertCircle, color: "text-red-500", bg: "bg-red-500" },
        { key: "reviewing", label: t.admin?.dashboard?.masteryReviewing || "复习中", count: data.masteryDistribution.reviewing, icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500" },
        { key: "mastered", label: t.admin?.dashboard?.masteryMastered || "已掌握", count: data.masteryDistribution.mastered, icon: CheckCircle, color: "text-green-500", bg: "bg-green-500" },
    ]

    return (
        <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 md:h-6 md:w-6 text-green-500" />
                    {t.admin?.dashboard?.masteryDistribution || "掌握度分布"}
                </CardTitle>
            </CardHeader>
            <CardContent>
                {total === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                        {t.admin?.dashboard?.noData || "暂无数据"}
                    </p>
                ) : (
                    <div className="space-y-3">
                        {items.map((item) => {
                            const pct = total > 0 ? Math.round((item.count / total) * 100) : 0
                            return (
                                <div key={item.key} className="space-y-1">
                                    <div className="flex justify-between text-sm items-center">
                                        <span className="flex items-center gap-1.5 font-medium">
                                            <item.icon className={`h-4 w-4 md:h-6 md:w-6 ${item.color}`} />
                                            {item.label}
                                        </span>
                                        <span className="text-muted-foreground">{item.count} ({pct}%)</span>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-2.5">
                                        <div
                                            className={`h-2.5 rounded-full ${item.bg} transition-all duration-500`}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function UserTable({ users, onViewDetail }: { users: AdminUserStats[]; onViewDetail: (userId: string) => void }) {
    const { t } = useLanguage()
    const [expandedId, setExpandedId] = useState<string | null>(null)

    return (
        <div className="space-y-3">
            {/* 桌面端表格 */}
            <div className="hidden md:block border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                        <tr>
                            <th className="text-left p-3 font-medium">{t.admin?.dashboard?.userName || "用户名"}</th>
                            <th className="text-left p-3 font-medium">{t.admin?.dashboard?.email || "邮箱"}</th>
                            <th className="text-center p-3 font-medium">{t.admin?.dashboard?.notebooks || "错题本"}</th>
                            <th className="text-center p-3 font-medium">{t.admin?.dashboard?.errors || "错题"}</th>
                            <th className="text-center p-3 font-medium">{t.admin?.dashboard?.practice || "练习"}</th>
                            <th className="text-center p-3 font-medium">{t.admin?.dashboard?.status || "状态"}</th>
                            <th className="text-center p-3 font-medium">{t.admin?.dashboard?.registeredAt || "注册时间"}</th>
                            <th className="text-center p-3 font-medium">{t.admin?.dashboard?.actions || "操作"}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((user) => (
                            <tr key={user.id} className="border-t hover:bg-muted/30 transition-colors">
                                <td className="p-3">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{user.name || "N/A"}</span>
                                        {user.role === "admin" && (
                                            <Badge variant="default" className="text-xs">{t.admin?.admin || "管理员"}</Badge>
                                        )}
                                    </div>
                                </td>
                                <td className="p-3 text-muted-foreground">{user.email}</td>
                                <td className="p-3 text-center">{user.notebookCount}</td>
                                <td className="p-3 text-center font-medium">{user.errorCount}</td>
                                <td className="p-3 text-center">{user.practiceCount}</td>
                                <td className="p-3 text-center">
                                    <Badge variant={user.isActive ? "default" : "destructive"} className="text-xs">
                                        {user.isActive ? (t.admin?.active || "启用") : (t.admin?.disabled || "禁用")}
                                    </Badge>
                                </td>
                                <td className="p-3 text-center text-muted-foreground text-xs">
                                    {new Date(user.createdAt).toLocaleDateString()}
                                </td>
                                <td className="p-3 text-center">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onViewDetail(user.id)}
                                        title={t.admin?.dashboard?.viewDetail || "查看详情"}
                                    >
                                        <Eye className="h-4 w-4 md:h-6 md:w-6" />
                                    </Button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 移动端卡片 */}
            <div className="md:hidden space-y-3">
                {users.map((user) => (
                    <Card key={user.id} className="border-0 shadow-sm">
                        <CardContent className="p-4">
                            <div
                                className="flex justify-between items-start cursor-pointer"
                                onClick={() => setExpandedId(expandedId === user.id ? null : user.id)}
                            >
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-medium">{user.name || "N/A"}</span>
                                        {user.role === "admin" && (
                                            <Badge variant="default" className="text-xs">{t.admin?.admin || "管理员"}</Badge>
                                        )}
                                    </div>
                                    <div className="text-sm text-muted-foreground">{user.email}</div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Badge variant={user.isActive ? "default" : "destructive"} className="text-xs">
                                        {user.isActive ? (t.admin?.active || "启用") : (t.admin?.disabled || "禁用")}
                                    </Badge>
                                    {expandedId === user.id ? (
                                        <ChevronUp className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                                    )}
                                </div>
                            </div>
                            {expandedId === user.id && (
                                <div className="mt-3 pt-3 border-t grid grid-cols-3 gap-3 text-center">
                                    <div>
                                        <div className="text-lg font-bold">{user.notebookCount}</div>
                                        <div className="text-xs text-muted-foreground">{t.admin?.dashboard?.notebooks || "错题本"}</div>
                                    </div>
                                    <div>
                                        <div className="text-lg font-bold text-red-500">{user.errorCount}</div>
                                        <div className="text-xs text-muted-foreground">{t.admin?.dashboard?.errors || "错题"}</div>
                                    </div>
                                    <div>
                                        <div className="text-lg font-bold text-green-500">{user.practiceCount}</div>
                                        <div className="text-xs text-muted-foreground">{t.admin?.dashboard?.practice || "练习"}</div>
                                    </div>
                                </div>
                            )}
                            {expandedId === user.id && (
                                <div className="mt-3 pt-3 border-t flex justify-between items-center">
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(user.createdAt).toLocaleDateString()}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => onViewDetail(user.id)}
                                    >
                                        <Eye className="h-4 w-4 md:h-6 md:w-6 mr-1" />
                                        {t.admin?.dashboard?.viewDetail || "查看详情"}
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}

export default function AdminPage() {
    const { data: session, status } = useSession()
    const router = useRouter()
    const { t } = useLanguage()
    const [data, setData] = useState<AdminDashboardData | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const result = await apiClient.get<AdminDashboardData>("/api/admin/dashboard")
            setData(result)
        } catch (error) {
            console.error("Failed to fetch dashboard data", error)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        if (status === "loading") return
        if (!session?.user || (session.user as any).role !== "admin") {
            router.push("/")
            return
        }
        fetchData()
    }, [session, status, router, fetchData])

    if (status === "loading" || loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (!data) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <p className="text-muted-foreground">{t.common?.error || "加载失败"}</p>
                <Button onClick={fetchData}>{t.admin?.dashboard?.retry || "重试"}</Button>
            </div>
        )
    }

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4 flex-wrap">
                <Button variant="ghost" size="sm" onClick={() => router.push("/")}>
                    <ArrowLeft className="h-4 w-4 md:h-6 md:w-6 mr-1" />
                    {t.common?.back || "返回"}
                </Button>
                <div>
                    <h1 className="text-2xl font-bold">{t.admin?.dashboard?.title || "管理员仪表盘"}</h1>
                    <p className="text-sm text-muted-foreground">
                        {t.admin?.dashboard?.subtitle || "查看全站用户和错题统计"}
                    </p>
                </div>
                <div className="ml-auto">
                    <Button variant="outline" className="min-h-11" onClick={() => router.push("/admin/lottery")}>
                        <Gift className="h-4 w-4 mr-2" />
                        {t.lottery?.admin?.title || "抽奖设置"}
                    </Button>
                </div>
            </div>

            {/* Overview Cards */}
            <OverviewCards data={data} t={t} />

            {/* Charts Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <DailyTrendChart data={data} t={t} />
                <MasteryDistributionCard data={data} t={t} />
            </div>

            {/* Subject Distribution */}
            <SubjectDistributionChart data={data} t={t} />

            {/* User List */}
            <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Users className="h-5 w-5 md:h-6 md:w-6 text-blue-500" />
                        {t.admin?.dashboard?.userList || "用户列表"}
                    </CardTitle>
                    <CardDescription>
                        {t.admin?.dashboard?.userListDesc || "所有注册用户的错题录入情况"}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <UserTable
                        users={data.userStats}
                        onViewDetail={(userId) => router.push(`/admin/user/${userId}`)}
                    />
                </CardContent>
            </Card>
        </div>
    )
}
