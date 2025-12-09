import { ParsedQuestion } from "@/lib/ai/types";

export interface Tag {
    id: string;
    name: string;
    category: string;
    subject: string;
    subcategory?: string | null;
    createdAt: string;
    updatedAt: string;
    _count?: {
        errorItems: number;
    };
}

// AI Model types
export interface AIModel {
    id: string;
    name: string;
    owned_by?: string;
}

export interface ModelsResponse {
    models: AIModel[];
    error?: string;
}

export interface Notebook {
    id: string;
    name: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
    _count?: {
        errorItems: number;
    };
}

export interface ErrorItem {
    id: string;
    userId: string;
    subjectId?: string | null;
    subject?: Notebook | null;
    originalImageUrl: string;
    ocrText?: string | null;
    questionText?: string | null;
    answerText?: string | null;
    analysis?: string | null;
    knowledgePoints?: string | null; // JSON string in DB, but API might return parsed array if handled? 
    // Wait, prisma returns it as string. Frontend needs to parse it.
    // Actually, let's check how it's used.

    source?: string | null;
    errorType?: string | null;
    userNotes?: string | null;

    masteryLevel: number;
    gradeSemester?: string | null;
    paperLevel?: string | null;

    createdAt: string;
    updatedAt: string;
}

// For creation/updates
export interface CreateErrorItemRequest extends ParsedQuestion {
    originalImageUrl: string;
    subjectId?: string;
    gradeSemester?: string;
    paperLevel?: string;
}

export interface AnalyzeResponse extends ParsedQuestion {
    // Inherits from ParsedQuestion:
    // questionText: string;
    // answerText: string;
    // analysis: string;
    // knowledgePoints: string[];
    // subject?: string;
}

export interface UserProfile {
    id: string;
    email: string;
    name?: string | null;
    educationStage?: string | null;
    enrollmentYear?: number | null;
    role: string;
    isActive: boolean;
}

export interface UpdateUserProfileRequest {
    name?: string;
    email?: string;
    educationStage?: string;
    enrollmentYear?: number;
    password?: string;
}

export interface AppConfig {
    aiProvider: 'gemini' | 'openai';
    openai?: {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
    };
    gemini?: {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
    };
    prompts?: {
        analyze?: string;
        similar?: string;
    };
}

export interface AnalyticsData {
    totalErrors: number;
    masteredCount: number;
    masteryRate: number;
    subjectStats: { name: string; value: number }[];
    activityData: { date: string; count: number }[];
}

export interface PracticeStatsData {
    subjectStats: { name: string; value: number }[];
    activityStats: { date: string; total: number; correct: number;[key: string]: any }[];
    difficultyStats: { name: string; value: number }[];
    overallStats: { total: number; correct: number; rate: string };
}

export interface TagStats {
    tag: string;
    count: number;
}

export interface TagStatsResponse {
    stats: TagStats[];
}

export interface TagSuggestionsResponse {
    suggestions: string[];
}

export interface AdminUser extends UserProfile {
    createdAt: string;
    _count: {
        errorItems: number;
        practiceRecords: number;
    };
}

export interface RegisterRequest {
    name: string;
    email: string;
    password: string;
    educationStage: string;
    enrollmentYear: number;
}
