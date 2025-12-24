import { test, expect } from '@playwright/test';
import path from 'path';

test('Upload image, correct, save, and verify in notebook', async ({ page }) => {
    // 增加测试超时时间
    test.setTimeout(90000);

    // Mock specific API calls to avoid external dependencies (AI)
    await page.route('**/api/analyze', async route => {
        // Return predictable mock analysis
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                questionText: '2 + 2 = ?',
                answerText: '4',
                analysis: 'Simple addition analysis.',
                knowledgePoints: ['Math', 'Addition'],
                subject: '数学', // Try to match the one we will create
                requiresImage: false
            })
        });
    });

    // 1. Login
    await page.goto('/login');
    await page.getByLabel(/邮箱|Email/).fill('admin@localhost');
    await page.getByLabel(/^密码$|^Password$/).fill('123456');
    await page.getByRole('button', { name: /登录|Login/ }).click();
    await page.waitForURL('**/', { timeout: 15000 });

    // 2. Ensure a Notebook exists
    // Go to Notebooks page
    await page.goto('/notebooks');

    // Check if "数学" exists, if not create it
    try {
        await expect(page.getByRole('link', { name: '数学' })).toBeVisible({ timeout: 3000 });
        console.log('Notebook math already exists.');
    } catch (e) {
        console.log('Notebook math not found, creating...');
        // Create it
        await page.getByRole('button', { name: /新建|New|Create/ }).first().click();

        // Dialog appears
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });

        // Fill name using ID 'name' which we confirmed in source code
        await page.locator('#name').fill('数学');

        // Click Create
        await page.getByRole('button', { name: /创建|Create/ }).last().click();

        // Wait for creation to appear
        await expect(page.getByText('数学')).toBeVisible({ timeout: 5000 });
    }

    // 3. Go back to Home for Upload
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 4. Upload Image
    const filePath = path.join(__dirname, './fixtures/math_test.png');
    // UploadZone handles drag-drop but exposes a hidden input
    await page.setInputFiles('input[type="file"]', filePath);

    // 5. Handle Image Cropper - 增加等待时间
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('heading', { name: /裁剪|Crop/ })).toBeVisible({ timeout: 5000 });
    // Click Confirm
    await page.getByRole('button', { name: /确认|Confirm/ }).click();

    // 6. Wait for Editor (Mocked analysis returns immediately)
    // Look for Editor Title "校对" or "Review"
    await expect(page.getByRole('heading', { level: 2 })).toContainText(/校对|Review|Correct/, { timeout: 10000 });

    // 7. Correct the Question Text
    // Prepend "试题：" to the question text
    // Use first textarea which corresponds to Question
    const questionBox = page.locator('textarea').nth(0);
    await expect(questionBox).toHaveValue('2 + 2 = ?', { timeout: 5000 }); // From mock
    await questionBox.fill('试题：2 + 2 = ?');

    // Verify knowledge points (from mock)
    await expect(page.locator('body')).toContainText('Addition');

    // 8. Select Notebook (if not matched)
    // Our mock returned "数学". The code tries to auto-select.
    const notebookSelector = page.locator('button[role="combobox"]').first();

    // Check text content of the button
    if (!(await notebookSelector.textContent())?.includes('数学')) {
        await notebookSelector.click();
        await page.getByRole('option', { name: '数学' }).click();
    }

    // 9. Save
    // Click "Save to Notebook" / "保存"
    await page.getByRole('button', { name: /保存|Save/ }).click();

    // 10. Verify Redirection and Content
    // Should redirect to /notebooks/[id]
    await page.waitForURL(/\/notebooks\/.+/, { timeout: 10000 });

    // Verify headers or content
    await expect(page.getByRole('heading', { level: 1 })).toContainText('数学');

    // Verify the new item is present
    // Question text should be "试题：2 + 2 = ?"
    await expect(page.locator('body')).toContainText('试题：2 + 2 = ?');

    // Verify Tags
    await expect(page.locator('body')).toContainText('Addition');

    // Verify Mastery Status (To Review / 待复习)
    await expect(page.locator('.badge, .inline-flex').filter({ hasText: /待复习|Review/ }).first()).toBeVisible();

    // 11. Delete ALL Error Items (Cleanup) to ensure notebook can be deleted
    while (true) {
        const items = page.locator('a[href^="/error-items/"]');
        const count = await items.count();
        console.log(`Found ${count} error items to delete.`);

        if (count === 0) break;

        // Click the first item
        await items.first().click();

        // Wait for Detail Page
        await expect(page.getByRole('heading', { level: 1, name: /详情|Detail/ })).toBeVisible({ timeout: 5000 });

        // Setup dialog handler for item deletion
        page.once('dialog', async dialog => {
            console.log(`Item Delete Dialog: ${dialog.message()}`);
            await dialog.accept();
        });

        // Click Delete Button
        await page.getByRole('button', { name: /删除|Delete/ }).click();

        // Wait to be redirected back to notebook page
        await page.waitForURL(/\/notebooks\/.+/, { timeout: 5000 });
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.waitForTimeout(500);
    }

    // 12. Verify Item Deleted
    await expect(page.getByText('试题：2 + 2 = ?')).not.toBeVisible();

    // 13. Delete the Notebook
    await page.goto('/notebooks');

    // Setup dialog handler for notebook deletion
    page.once('dialog', async dialog => {
        console.log(`Notebook Delete Dialog: ${dialog.message()}`);
        await dialog.accept();
    });

    // Locate the delete button specifically for the "数学" notebook
    const notebookCard = page.locator('.group').filter({ hasText: '数学' }).first();

    // Hover to reveal button
    await notebookCard.hover();

    // Click the delete button (Trash icon)
    await notebookCard.getByRole('button').last().click();

    // 14. Verify Notebook Deleted
    await expect(page.getByText('数学', { exact: true })).not.toBeVisible({ timeout: 5000 });

});
