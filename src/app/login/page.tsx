"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";

export default function LoginPage() {
    const router = useRouter();
    const { t, language } = useLanguage();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const result = await signIn("credentials", {
                redirect: false,
                email,
                password,
            });

            if (result?.error) {
                setError(t.auth?.login?.failed || 'Login failed');
            } else {
                router.push("/");
                router.refresh();
            }
        } catch (error) {
            setError(t.auth?.login?.error || 'An error occurred');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">
                        {t.auth?.login?.title || 'Login'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {/*
                      method="post" 是安全兜底：
                      若浏览器未能完成 hydration（如 iPad Safari 上出现过的
                      「点击毫无反应」），表单会退化成原生提交。默认的 GET 会把
                      password 明文拼进地址栏和浏览器历史（曾实际发生）。
                      用 POST 后最坏情况只是请求被服务端拒绝，不会泄露凭据。
                    */}
                    <form onSubmit={handleSubmit} method="post" className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="email" className="text-sm font-medium">
                                {t.auth?.email || 'Email'}
                            </label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
                                // 以下属性让 iOS/Android 的密码管理器能正确识别这是「登录用户名」：
                                // 缺少 autocomplete 时，Safari 往往不会弹出「存储密码」提示，
                                // 也无法在下次登录时用面容/指纹自动填充。
                                autoComplete="username"
                                inputMode="email"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="password" className="text-sm font-medium">
                                {t.auth?.password || 'Password'}
                            </label>
                            <Input
                                id="password"
                                name="password"
                                type="password"
                                // current-password = 已有密码（触发保存/自动填充）
                                // 注册页用的是 new-password，二者不能混用
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        {error && (
                            <div className="text-red-500 text-sm text-center">{error}</div>
                        )}
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading
                                ? (t.auth?.login?.loggingIn || 'Logging in...')
                                : (t.auth?.login?.action || 'Login')}
                        </Button>
                        <div className="text-center text-sm text-muted-foreground">
                            {t.auth?.login?.noAccount || "Don't have an account? "}
                            <Link href="/register" className="text-primary hover:underline">
                                {t.auth?.login?.registerNow || 'Register now'}
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
