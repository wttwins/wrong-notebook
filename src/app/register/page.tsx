"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react";
import { apiClient } from "@/lib/api-client";
import { RegisterRequest } from "@/types/api";

export default function RegisterPage() {
    const router = useRouter();
    const { t, language } = useLanguage();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [educationStage, setEducationStage] = useState("junior_high");
    const [enrollmentYear, setEnrollmentYear] = useState("2025");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [allowRegistration, setAllowRegistration] = useState<boolean | null>(null);

    useEffect(() => {
        checkRegistrationStatus();
    }, []);

    const checkRegistrationStatus = async () => {
        try {
            const res = await fetch("/api/register/status");
            const data = await res.json();
            setAllowRegistration(data.allowRegistration);
        } catch (error) {
            console.error("Failed to check registration status", error);
            setAllowRegistration(true); // 默认允许
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        // 验证两次密码是否一致
        if (password !== confirmPassword) {
            setError(t.auth?.register?.passwordMismatch || 'Passwords do not match');
            setLoading(false);
            return;
        }

        try {
            await apiClient.post<any, RegisterRequest>("/api/register", {
                name,
                email,
                password,
                educationStage,
                enrollmentYear: parseInt(enrollmentYear)
            });

            alert(t.auth?.register?.success || 'Registration successful! Please login');
            router.push("/login");
        } catch (error: any) {
            let errorMsg = error.data?.message;
            if (errorMsg === 'User with this email already exists') {
                errorMsg = t.auth?.register?.emailExists || errorMsg;
            } else {
                errorMsg = errorMsg || (t.auth?.register?.failed || 'Registration failed');
            }
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    // 加载中状态
    if (allowRegistration === null) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    // 注册已禁用
    if (allowRegistration === false) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle className="text-2xl text-center">
                            {t.auth?.register?.disabled || 'Registration Disabled'}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col items-center gap-4 py-6">
                            <AlertCircle className="h-12 w-12 text-muted-foreground" />
                            <p className="text-center text-muted-foreground">
                                {t.auth?.register?.disabledMessage || 'Registration is currently disabled by administrator. Please contact admin for access.'}
                            </p>
                        </div>
                        <div className="text-center">
                            <Link href="/login" className="text-primary hover:underline">
                                {t.auth?.register?.backToLogin || 'Back to Login'}
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle className="text-2xl text-center">
                        {t.auth?.register?.title || 'Create an Account'}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <label htmlFor="name" className="text-sm font-medium">
                                {t.auth?.name || 'Name'}
                            </label>
                            <Input
                                id="name"
                                name="name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="email" className="text-sm font-medium">
                                {t.auth?.email || 'Email'}
                            </label>
                            <Input
                                id="email"
                                name="email"
                                type="email"
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
                            <div className="relative">
                                <Input
                                    id="password"
                                    name="password"
                                    type={showPassword ? "text" : "password"}
                                    // new-password 才会让浏览器提示「保存密码」，
                                    // 配合登录页的 current-password 实现面容/指纹自动填充
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowPassword(!showPassword)}
                                    tabIndex={-1}
                                >
                                    {showPassword ? (
                                        <EyeOff className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                                    ) : (
                                        <Eye className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                                    )}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="confirmPassword" className="text-sm font-medium">
                                {t.auth?.confirmPassword || 'Confirm Password'}
                            </label>
                            <div className="relative">
                                <Input
                                    id="confirmPassword"
                                    name="confirmPassword"
                                    type={showConfirmPassword ? "text" : "password"}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    className="pr-10"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                    tabIndex={-1}
                                >
                                    {showConfirmPassword ? (
                                        <EyeOff className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                                    ) : (
                                        <Eye className="h-4 w-4 md:h-6 md:w-6 text-muted-foreground" />
                                    )}
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="educationStage" className="text-sm font-medium">
                                {t.auth?.educationStage || 'Education Stage'}
                            </label>
                            <select
                                id="educationStage"
                                name="educationStage"
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                value={educationStage}
                                onChange={(e) => setEducationStage(e.target.value)}
                                required
                            >
                                <option value="" disabled>{t.auth?.selectStage || 'Select Stage'}</option>
                                <option value="primary">{t.auth?.primary || 'Primary School'}</option>
                                <option value="junior_high">{t.auth?.juniorHigh || 'Junior High'}</option>
                                <option value="senior_high">{t.auth?.seniorHigh || 'Senior High'}</option>
                                <option value="university">{t.auth?.university || 'University'}</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label htmlFor="enrollmentYear" className="text-sm font-medium">
                                {t.auth?.enrollmentYear || 'Enrollment Year'}
                            </label>
                            <Input
                                id="enrollmentYear"
                                name="enrollmentYear"
                                type="number"
                                value={enrollmentYear}
                                onChange={(e) => setEnrollmentYear(e.target.value)}
                                placeholder="YYYY"
                                required
                                min={1990}
                                max={new Date().getFullYear()}
                            />
                        </div>
                        {error && (
                            <div className="text-red-500 text-sm text-center">{error}</div>
                        )}
                        <Button type="submit" className="w-full" disabled={loading}>
                            {loading
                                ? (t.auth?.register?.registering || 'Registering...')
                                : (t.auth?.register?.action || 'Register')}
                        </Button>
                        <div className="text-center text-sm text-muted-foreground">
                            {t.auth?.register?.hasAccount || "Already have an account? "}
                            <Link href="/login" className="text-primary hover:underline">
                                {t.auth?.register?.loginHere || 'Login here'}
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
