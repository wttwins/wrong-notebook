import fs from 'fs';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'config', 'app-config.json');

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

const DEFAULT_CONFIG: AppConfig = {
    aiProvider: (process.env.AI_PROVIDER as 'gemini' | 'openai') || 'gemini',
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        baseUrl: process.env.OPENAI_BASE_URL,
        model: process.env.OPENAI_MODEL || 'gpt-4o',
    },
    gemini: {
        apiKey: process.env.GOOGLE_API_KEY,
        baseUrl: process.env.GEMINI_BASE_URL,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    },
    prompts: {
        analyze: '',
        similar: '',
    },
};

export function getAppConfig(): AppConfig {
    if (fs.existsSync(CONFIG_FILE_PATH)) {
        try {
            const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
            const userConfig = JSON.parse(fileContent);
            // Merge with default to ensure all fields exist
            return {
                ...DEFAULT_CONFIG,
                ...userConfig,
                openai: { ...DEFAULT_CONFIG.openai, ...userConfig.openai },
                gemini: { ...DEFAULT_CONFIG.gemini, ...userConfig.gemini },
                prompts: { ...DEFAULT_CONFIG.prompts, ...userConfig.prompts },
            };
        } catch (error) {
            console.error("Failed to read config file:", error);
            return DEFAULT_CONFIG;
        }
    }
    return DEFAULT_CONFIG;
}

export function updateAppConfig(newConfig: Partial<AppConfig>) {
    const currentConfig = getAppConfig();
    const updatedConfig = {
        ...currentConfig,
        ...newConfig,
        openai: { ...currentConfig.openai, ...newConfig.openai },
        gemini: { ...currentConfig.gemini, ...newConfig.gemini },
        prompts: { ...currentConfig.prompts, ...newConfig.prompts },
    };

    try {
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(updatedConfig, null, 2));
        return updatedConfig;
    } catch (error) {
        console.error("Failed to write config file:", error);
        throw error;
    }
}
