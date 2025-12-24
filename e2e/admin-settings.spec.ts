import { test, expect } from '@playwright/test';

test('Admin can configure OpenAI settings with multi-instance support', async ({ page }) => {
    // 增加测试超时时间
    test.setTimeout(60000);

    // 1. Login as Admin
    await page.goto('/login');
    await page.locator('input[name="email"]').fill('admin@localhost');
    await page.locator('input[name="password"]').fill('123456');
    await page.locator('button[type="submit"]').click();

    // Wait for login to complete
    await page.waitForURL('**/', { timeout: 15000 });

    // 2. Open Settings
    await page.getByRole('button', { name: '设置' }).click();

    // Wait for dialog to be visible
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // 3. Switch to AI Tab (支持中英文)
    await page.getByRole('tab', { name: /AI Provider|AI 提供商/ }).click();

    // 4. Select OpenAI Provider
    const providerTrigger = page.locator('[role="dialog"] button[role="combobox"]').first();
    await providerTrigger.click();

    // Select OpenAI option
    await page.getByRole('option', { name: 'OpenAI / Compatible' }).click();

    // 5. Add a new instance (multi-instance support)
    // Click "Add" button to create a new instance
    await page.getByRole('button', { name: /添加|Add/ }).click();

    // 6. Fill instance configuration
    const instanceName = '智谱 GLM-4V';
    const apiKey = 'sk-aaa';
    const baseURL = 'https://new.xxx.net/v1';
    const modelName = 'claude-haiku-4.5';

    // Instance Name Input - use the actual placeholder from the component
    await page.locator('input[placeholder="e.g. 智谱 GLM-4V"]').fill(instanceName);

    // API Key Input associated by placeholder
    await page.locator('input[placeholder="sk-..."]').fill(apiKey);

    // Base URL Input associated by placeholder
    await page.locator('input[placeholder="https://api.openai.com/v1"]').fill(baseURL);

    // Model Name Input
    // Placeholder for OpenAI custom model input is "gpt-4o"
    await page.locator('input[placeholder="gpt-4o"]').fill(modelName);

    // 7. Save Settings
    page.once('dialog', async dialog => {
        console.log(`Dialog message: ${dialog.message()}`);
        expect(dialog.message()).toMatch(/设置已保存|Settings saved/);
        await dialog.accept();
    });

    await page.getByRole('button', { name: /保存 AI 设置|Save AI Settings/ }).click();

    // 等待保存完成
    await page.waitForTimeout(1000);

    // 8. Verify Persistence
    await page.reload();

    // 等待页面加载完成
    await page.waitForLoadState('networkidle');

    // 重新打开 Settings Dialog
    await page.getByRole('button', { name: '设置' }).click();

    // 等待对话框显示
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

    // Switch to AI Tab (支持中英文)
    await page.getByRole('tab', { name: /AI Provider|AI 提供商/ }).click();

    // Verify values match
    // First combobox should be AI Provider, second should be instance selector
    await expect(page.locator('button[role="combobox"]').first()).toHaveText('OpenAI / Compatible');
    await expect(page.locator('input[placeholder="sk-..."]')).toHaveValue(apiKey);
    await expect(page.locator('input[placeholder="https://api.openai.com/v1"]')).toHaveValue(baseURL);
    await expect(page.locator('input[placeholder="gpt-4o"]')).toHaveValue(modelName);
});
