import { test, expect, Page } from '@playwright/test';

/**
 * Authenticated flow tests.
 *
 * These exercise pages behind the auth guard by logging in through the real
 * login form. A mock backend (tests/mock-backend/server.js) stands in for the
 * API and returns a role based on the email prefix used to sign in.
 */

/** Log in via the login form as the given role. Leaves the browser on /dashboard. */
async function loginAs(page: Page, role: 'parent' | 'coach' | 'admin'): Promise<void> {
    await page.goto('/login');
    const form = page.locator('form', { has: page.locator('#login-email') });
    await form.locator('#login-email').fill(`${role}@test.com`);
    await form.locator('#login-password').fill('password123');
    await form.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe('login', () => {
    test('invalid credentials show an error and stay on /login', async ({ page }) => {
        await page.goto('/login');
        const form = page.locator('form', { has: page.locator('#login-email') });
        await form.locator('#login-email').fill('wrong@test.com');
        await form.locator('#login-password').fill('password123');
        await form.getByRole('button', { name: /sign in/i }).click();

        await expect(page).toHaveURL(/\/login$/);
        await expect(page.getByText(/invalid email or password/i)).toBeVisible();
    });
});

test.describe('role-based dashboards', () => {
    test('parent sees the parent dashboard', async ({ page }) => {
        await loginAs(page, 'parent');
        await expect(
            page.getByText(/manage your children's inline hockey activities/i)
        ).toBeVisible();
    });

    test('coach sees the coach dashboard', async ({ page }) => {
        await loginAs(page, 'coach');
        await expect(page.getByText(/welcome back coach \/ team manager/i)).toBeVisible();
    });

    test('admin sees the admin dashboard', async ({ page }) => {
        await loginAs(page, 'admin');
        await expect(page.getByText(/welcome back, administrator/i)).toBeVisible();
    });
});

test.describe('authenticated pages', () => {
    test('logged-in user can view /fixtures (no redirect)', async ({ page }) => {
        await loginAs(page, 'parent');
        const response = await page.goto('/fixtures');

        expect(response!.status()).toBe(200);
        await expect(page).toHaveURL(/\/fixtures$/);
        await expect(page).toHaveTitle(/fixtures/i);
    });

    test('logged-in user can view the teams page', async ({ page }) => {
        await loginAs(page, 'coach');
        const response = await page.goto('/dashboard/teams');

        expect(response!.status()).toBe(200);
        await expect(page).toHaveURL(/\/dashboard\/teams$/);
        await expect(page).toHaveTitle(/teams/i);
    });

    test('parent can open the add-child form', async ({ page }) => {
        await loginAs(page, 'parent');
        const response = await page.goto('/dashboard/children/add');

        expect(response!.status()).toBe(200);
        await expect(page).toHaveTitle(/add child/i);
    });
});

test.describe('admin child removal', () => {
    const childId = '123e4567-e89b-42d3-a456-426614174000';

    test('admin can permanently remove a child from the detail page', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto(`/dashboard/children/all/${childId}`);

        const removeButton = page.getByRole('button', { name: /admin: permanently remove child/i });
        await expect(removeButton).toBeVisible();
        page.once('dialog', (dialog) => dialog.accept());
        await removeButton.click();

        await expect(page).toHaveURL(/\/dashboard\/children\/all\?deleted=1$/);
        await expect(page.getByRole('status')).toContainText(/permanently removed/i);
    });

    test('non-admin users cannot submit the admin removal route', async ({ page }) => {
        await loginAs(page, 'parent');
        const response = await page.request.post(
            `/dashboard/children/all/${childId}/delete`,
            { form: { website: '' } }
        );

        expect(response.status()).toBe(403);
    });

    test('admin sees a failure message when permanent removal fails', async ({ page }) => {
        await loginAs(page, 'admin');
        await page.goto(`/dashboard/children/all/${childId.replace(/4000$/, '0001')}`);

        page.once('dialog', (dialog) => dialog.accept());
        await page.getByRole('button', { name: /admin: permanently remove child/i }).click();

        await expect(page).toHaveURL(/error=Could%20not%20delete%20child\./);
        await expect(
            page.getByRole('alert').filter({ hasText: 'Could not delete child.' })
        ).toBeVisible();
    });

    test('parent retains the existing child removal action, without the admin action', async ({ page }) => {
        await loginAs(page, 'parent');
        await page.goto(`/dashboard/children/${childId}`);

        await expect(page.getByRole('button', { name: 'Remove Child' })).toBeVisible();
        await expect(
            page.getByRole('button', { name: /admin: permanently remove child/i })
        ).toHaveCount(0);
    });
});

test.describe('logout', () => {
    test('logging out clears the session and re-locks protected routes', async ({ page }) => {
        await loginAs(page, 'parent');

        // GET /logout is supported for convenience and destroys the session.
        await page.goto('/logout');
        await expect(page).toHaveURL(/\/$/);

        // Protected route should now redirect back to /login.
        await page.goto('/dashboard');
        await expect(page).toHaveURL(/\/login$/);
    });
});
