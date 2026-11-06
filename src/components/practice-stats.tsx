"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { Loader2, TrendingUp, BookOpen, Target } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { PracticeStatsData } from "@/types/api";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'];
const DIFFICULTY_COLORS: Record<string, string> = {
    'easy': '#4ade80',   // Green-400
    'medium': '#facc15', // Yellow-400
    'hard': '#fb923c',   // Orange-400
    'harder': '#f87171', // Red-400
    'Unknown': '#94a3b8' // Slate-400
};

const CustomTooltip = ({ active, payload, label, t }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-background border rounded-lg shadow-lg p-3 text-sm">
                <p className="font-medium mb-2">{label}</p>
                {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 mb-1 last:mb-0">
                        <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-muted-foreground">
                            {entry.name}:
                        </span>
                        <span className="font-medium">
                            {entry.value}
                        </span>
                    </div>
                ))}
                <div className="mt-2 pt-2 border-t flex justify-between gap-4">
                    <span className="text-muted-foreground">{t.stats?.total || "Total"}:</span>
                    <span className="font-bold">
                        {payload.reduce((acc: number, curr: any) => acc + (typeof curr.value === 'number' ? curr.value : 0), 0)}
                    </span>
                </div>
            </div>
        );
    }
    return null;
};

export function PracticeStats() {
    const { t, language } = useLanguage();
    const [stats, setStats] = useState<PracticeStatsData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        apiClient.get<PracticeStatsData>("/api/stats/practice")
            .then(data => {
                setStats(data);
                setLoading(false);
            })
            .catch(err => {
                console.error("Failed to fetch stats:", err);
                setLoading(false);
            });
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!stats || stats.overallStats.total === 0) {
        return null; // Don't show if no data
    }

    // Helper to translate difficulty
    const getDifficultyLabel = (key: string) => {
        // @ts-ignore
        return t.practice?.difficulty?.[key] || key;
    };

    // Get unique difficulties for the bar chart
    const difficulties = stats.difficultyStats.map(d => d.name);

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold tracking-tight">{t.stats?.title || "Practice Statistics"}</h2>

            {/* Overview Cards */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {t.stats?.totalPractices || "Total Practiced"}
                        </CardTitle>
                        <BookOpen className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.overallStats.total}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {t.stats?.correctRate || "Correct Rate"}
                        </CardTitle>
                        <Target className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.overallStats.rate}%</div>
                        <p className="text-xs text-muted-foreground">
                            {stats.overallStats.correct} / {stats.overallStats.total} {t.stats?.correct || "Correct"}
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">
                            {t.stats?.activeDays || "Active Days (6m)"}
                        </CardTitle>
                        <TrendingUp className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.activityStats.filter(d => d.total > 0).length}</div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Subject Distribution */}
                <Card className="col-span-2 md:col-span-1">
                    <CardHeader>
                        <CardTitle>{t.stats?.subjectDistribution || "Subject Distribution"}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={stats.subjectStats}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    fill="#8884d8"
                                    paddingAngle={5}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                                >
                                    {stats.subjectStats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Monthly Activity with Difficulty Stack */}
                <Card className="col-span-2 md:col-span-1">
                    <CardHeader>
                        <CardTitle>{t.stats?.weeklyTrend || "Monthly Trend"}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.activityStats} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                <XAxis
                                    dataKey="date"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6b7280', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis
                                    allowDecimals={false}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#6b7280', fontSize: 12 }}
                                />
                                <Tooltip content={<CustomTooltip t={t} />} cursor={{ fill: 'transparent' }} />
                                <Legend
                                    iconType="circle"
                                    iconSize={8}
                                    wrapperStyle={{ paddingTop: '20px' }}
                                />
                                {difficulties.map((diff, index) => (
                                    <Bar
                                        key={diff}
                                        dataKey={diff}
                                        name={getDifficultyLabel(diff)}
                                        stackId="a"
                                        fill={DIFFICULTY_COLORS[diff] || COLORS[index % COLORS.length]}
                                        radius={index === difficulties.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                                        barSize={32}
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
