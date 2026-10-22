import { test, expect } from "@playwright/test";
import path from "node:path";

const INDEX_URL = "file://" + path.resolve("index.html");

test.describe("Cryptyrus — Functional & Standalone Recovery Tests", () => {

    test("1. Security warnings & entropy confirmation dialog", async ({ page }) => {
        await page.goto(INDEX_URL);

        // Attempt encryption with a weak passphrase (< 60 bits)
        await page.fill("#s-desc", "Warning Test");
        await page.fill("#s-secret", "my-secret-data");
        await page.fill("#s-pwd", "password123");
        await page.click("#s-go");

        // Verify confirmation modal appears
        const confirmPanel = page.locator("#confirm-panel");
        await expect(confirmPanel).toHaveClass(/show/);
        await expect(page.locator("#confirm-list")).toContainText("Weak passphrase");

        // Cancel to fix
        await page.click("#confirm-cancel");
        await expect(confirmPanel).not.toHaveClass(/show/);
    });

    test("2. Full cycle: Single Sheet encryption and recovery", async ({ page }) => {
        await page.goto(INDEX_URL);

        const secret = "api_key: sk_live_998877665544332211";
        const password = "correct-horse-battery-staple-2026";

        await page.fill("#s-desc", "Bank Accounts");
        await page.fill("#s-secret", secret);
        await page.fill("#s-pwd", password);
        await page.click("#s-go");

        const confirmPanel = page.locator("#confirm-panel");
        if (await confirmPanel.isVisible()) {
            await page.click("#confirm-go");
        }

        await expect(page.locator("#preview")).toHaveClass(/show/);
        await expect(page.locator("#preview-format")).toContainText("QRS1 v1");

        // Extract QR payload
        const payload = await page.locator("#sheets .sh-payload").textContent();
        expect(payload).toBeTruthy();

        // Recover via main UI open tab
        await page.click("#tab-open");
        await page.fill("#o-input", payload);
        await page.click("#o-add");
        await page.fill("#o-pwd", password);
        await page.click("#o-go");

        await expect(page.locator("#o-result")).toHaveText(secret);
        await expect(page.locator("#o-result")).not.toHaveClass(/err/);
    });

    test("3. Full cycle: Shamir Secret Sharing (Split across sheets)", async ({ page }) => {
        await page.goto(INDEX_URL);
        await page.click("#tab-share");

        const secret = "seed-phrase: alpha bravo charlie delta echo foxtrot";

        await page.fill("#p-desc", "Family Vault");
        await page.fill("#p-secret", secret);
        await page.selectOption("#p-total", "3");
        await page.selectOption("#p-threshold", "2"); // 2 of 3 required
        await page.click("#p-go");

        await expect(page.locator("#preview")).toHaveClass(/show/);

        const payloads = await page.locator("#sheets .sh-payload").allTextContents();
        expect(payloads).toHaveLength(3);

        // Try recovery with insufficient shares (1 of 2)
        await page.click("#tab-open");
        await page.fill("#o-input", payloads[0]);
        await page.click("#o-add");
        await page.click("#o-go");
        await expect(page.locator("#o-progress")).toContainText("1 of 2 required");

        // Add second required share (part 3)
        await page.fill("#o-input", payloads[2]);
        await page.click("#o-add");
        await page.click("#o-go");

        await expect(page.locator("#o-result")).toHaveText(secret);
    });

    test("4. Special characters, accents and normalization edge cases", async ({ page }) => {
        await page.goto(INDEX_URL);

        // Secret containing emojis, Cyrillic, accented characters, and base64 special chars
        const complexSecret = "🔑 Key: Éléphant & Cœur — Бельгия 🌍 (test+/=_-)";
        const pwdNFC = "Été-À-Côté-Forêt-2026".normalize("NFC");
        const pwdNFD = "Été-À-Côté-Forêt-2026".normalize("NFD"); // Decomposed accents (macOS style)

        await page.fill("#s-desc", "Accents & Emojis");
        await page.fill("#s-secret", complexSecret);
        await page.fill("#s-pwd", pwdNFC);
        await page.click("#s-go");

        const confirmPanel = page.locator("#confirm-panel");
        if (await confirmPanel.isVisible()) {
            await page.click("#confirm-go");
        }

        await expect(page.locator("#preview")).toHaveClass(/show/);
        const payload = await page.locator("#sheets .sh-payload").textContent();

        // Recovery using NFD passphrase input (tests NFC/NFD fallback logic)
        await page.click("#tab-open");
        await page.fill("#o-input", payload);
        await page.click("#o-add");
        await page.fill("#o-pwd", pwdNFD);
        await page.click("#o-go");

        await expect(page.locator("#o-result")).toHaveText(complexSecret);
        await expect(page.locator("#o-result")).not.toHaveClass(/err/);
    });

    test("5. Standalone recovery script: Single Sheet", async ({ page }) => {
        await page.goto(INDEX_URL);

        const secret = "standalone-secret-xyz-777";
        const password = "my-standalone-passphrase-2026";

        await page.fill("#s-desc", "Standalone Test");
        await page.fill("#s-secret", secret);
        await page.fill("#s-pwd", password);
        await page.click("#s-go");

        if (await page.locator("#confirm-panel").isVisible()) {
            await page.click("#confirm-go");
        }
        await expect(page.locator("#preview")).toHaveClass(/show/);

        // Extract standalone HTML code block
        const standaloneHtml = await page.locator(".sh-code").first().textContent();
        expect(standaloneHtml).toContain("crypto.subtle");

        // Handle prompt dialog triggered by standalone script
        page.on("dialog", async (dialog) => {
            expect(dialog.type()).toBe("prompt");
            await dialog.accept(password);
        });

        // Load standalone recovery script via data URI
        await page.goto("data:text/html;charset=utf-8," + encodeURIComponent(standaloneHtml));

        await expect(page.locator("body")).toHaveText(secret);
    });

    test("6. Standalone recovery script: Shamir Share (2-of-2)", async ({ page }) => {
        await page.goto(INDEX_URL);
        await page.click("#tab-share");

        const secret = "shamir-standalone-secret-123";
        await page.fill("#p-desc", "Standalone Share");
        await page.fill("#p-secret", secret);
        await page.selectOption("#p-total", "2");
        await page.selectOption("#p-threshold", "2");
        await page.click("#p-go");

        await expect(page.locator("#preview")).toHaveClass(/show/);

        const payloads = await page.locator("#sheets .sh-payload").allTextContents();
        const standaloneHtmlSheet1 = await page.locator(".sh-code").first().textContent();

        page.on("dialog", async (dialog) => {
            expect(dialog.type()).toBe("prompt");
            await dialog.accept(payloads[1]); // Provide missing part 2
        });

        await page.goto("data:text/html;charset=utf-8," + encodeURIComponent(standaloneHtmlSheet1));

        await expect(page.locator("body")).toHaveText(secret);
    });

    test("7. Theme toggle (Light / Dark)", async ({ page }) => {
        await page.goto(INDEX_URL);

        const html = page.locator("html");
        await expect(html).not.toHaveAttribute("data-theme");

        // Switch to dark theme
        await page.click("#theme-toggle");
        await expect(html).toHaveAttribute("data-theme", "dark");

        // Switch back to light theme
        await page.click("#theme-toggle");
        await expect(html).not.toHaveAttribute("data-theme");
    });
});
