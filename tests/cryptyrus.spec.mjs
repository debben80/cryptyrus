import { test, expect } from "@playwright/test";
import path from "node:path";

const INDEX_URL = "file://" + path.resolve("site/index.html");

function describeTest(text) {
    test.info().annotations.push({ type: "description", description: text });
}

test.describe("Cryptyrus — Functional & Standalone Recovery Tests", () => {

    test("1. Security warnings & entropy dialog", async ({ page }) => {
        describeTest("Verifies that a 12-char weak passphrase (< 60 bits) triggers the confirmation modal and can be cancelled.");

        await test.step("Open application and fill weak 12-character passphrase", async () => {
            await page.goto(INDEX_URL);
            await page.fill("#s-desc", "Warning Test");
            await page.fill("#s-secret", "my-secret-data");
            await page.fill("#s-pwd", "password1234");
            await page.click("#s-go");
        });

        await test.step("Verify warning modal appears and cancel button hides it", async () => {
            const confirmPanel = page.locator("#confirm-panel");
            await expect(confirmPanel).toHaveClass(/show/);
            await expect(page.locator("#confirm-list")).toContainText("Weak passphrase");
            await page.click("#confirm-cancel");
            await expect(confirmPanel).not.toHaveClass(/show/);
        });
    });

    test("2. Full cycle: Single Sheet (QRS1 v1)", async ({ page }) => {
        describeTest("Encrypts a secret with AES-256-GCM + PBKDF2 (QRS1 v1) and recovers it via the Recover tab.");

        const secret = "api_key: sk_live_998877665544332211";
        const password = "correct-horse-battery-staple-2026";
        let payload = "";

        await test.step("Encrypt secret and generate single sheet preview", async () => {
            await page.goto(INDEX_URL);
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
            payload = await page.locator("#sheets .sh-payload").textContent();
            expect(payload).toBeTruthy();
        });

        await test.step("Recover secret from generated payload in Open tab", async () => {
            await page.click("#tab-open");
            await page.fill("#o-input", payload);
            await page.click("#o-add");
            await page.fill("#o-pwd", password);
            await page.click("#o-go");
            await expect(page.locator("#o-result")).toHaveText(secret);
            await expect(page.locator("#o-result")).not.toHaveClass(/err/);
        });
    });

    test("3. Full cycle: Shamir Secret Sharing (QRS1 v2)", async ({ page }) => {
        describeTest("Splits a secret into 3 Shamir shares (threshold 2), checks 1 share is insufficient, and reconstructs with 2 shares.");

        const secret = "seed-phrase: alpha bravo charlie delta echo foxtrot";
        let payloads = [];

        await test.step("Generate 2-of-3 Shamir split sheets", async () => {
            await page.goto(INDEX_URL);
            await page.click("#tab-share");
            await page.fill("#p-desc", "Family Vault");
            await page.fill("#p-secret", secret);
            await page.selectOption("#p-total", "3");
            await page.selectOption("#p-threshold", "2");
            await page.click("#p-go");
            await expect(page.locator("#preview")).toHaveClass(/show/);
            payloads = await page.locator("#sheets .sh-payload").allTextContents();
            expect(payloads).toHaveLength(3);
        });

        await test.step("Verify 1 share alone cannot reconstruct, then add 2nd share", async () => {
            await page.click("#tab-open");
            await page.fill("#o-input", payloads[0]);
            await page.click("#o-add");
            await page.click("#o-go");
            await expect(page.locator("#o-progress")).toContainText("1 of 2 required");

            await page.fill("#o-input", payloads[2]);
            await page.click("#o-add");
            await page.click("#o-go");
            await expect(page.locator("#o-result")).toHaveText(secret);
        });
    });

    test("4. Special characters, accents & Unicode NFC/NFD", async ({ page }) => {
        describeTest("Tests emojis, Cyrillic, Base64 symbols in secret, and cross-platform NFC/NFD passphrase normalization.");

        const complexSecret = "🔑 Key: Éléphant & Cœur — Бельгия 🌍 (test+/=_-)";
        const pwdNFC = "Été-À-Côté-Forêt-2026".normalize("NFC");
        const pwdNFD = "Été-À-Côté-Forêt-2026".normalize("NFD");
        let payload = "";

        await test.step("Encrypt complex UTF-8 secret using NFC passphrase", async () => {
            await page.goto(INDEX_URL);
            await page.fill("#s-desc", "Accents & Emojis");
            await page.fill("#s-secret", complexSecret);
            await page.fill("#s-pwd", pwdNFC);
            await page.click("#s-go");

            const confirmPanel = page.locator("#confirm-panel");
            if (await confirmPanel.isVisible()) {
                await page.click("#confirm-go");
            }
            await expect(page.locator("#preview")).toHaveClass(/show/);
            payload = await page.locator("#sheets .sh-payload").textContent();
        });

        await test.step("Decrypt using decomposed NFD passphrase (macOS/iOS simulation)", async () => {
            await page.click("#tab-open");
            await page.fill("#o-input", payload);
            await page.click("#o-add");
            await page.fill("#o-pwd", pwdNFD);
            await page.click("#o-go");
            await expect(page.locator("#o-result")).toHaveText(complexSecret);
            await expect(page.locator("#o-result")).not.toHaveClass(/err/);
        });
    });

    test("5. Standalone recovery program: Single Sheet", async ({ page }) => {
        describeTest("Extracts the printed one-line HTML recovery script for a single sheet and executes it standalone.");

        const secret = "standalone-secret-xyz-777";
        const password = "my-standalone-passphrase-2026";
        let standaloneHtml = "";

        await test.step("Generate sheet and extract standalone HTML code", async () => {
            await page.goto(INDEX_URL);
            await page.fill("#s-desc", "Standalone Test");
            await page.fill("#s-secret", secret);
            await page.fill("#s-pwd", password);
            await page.click("#s-go");

            if (await page.locator("#confirm-panel").isVisible()) {
                await page.click("#confirm-go");
            }
            await expect(page.locator("#preview")).toHaveClass(/show/);
            standaloneHtml = await page.locator(".sh-code").first().textContent();
            expect(standaloneHtml).toContain("crypto.subtle");
        });

        await test.step("Execute standalone HTML and supply passphrase via prompt()", async () => {
            page.once("dialog", async (dialog) => {
                expect(dialog.type()).toBe("prompt");
                await dialog.accept(password);
            });
            await page.setContent(standaloneHtml, { waitUntil: "load" });
            await page.evaluate(() => {
                if (typeof window.onload === "function") window.onload();
            });
            await expect(page.locator("body")).toHaveText(secret);
        });
    });

    test("6. Standalone recovery program: Shamir Share (2-of-2)", async ({ page }) => {
        describeTest("Extracts the printed HTML recovery script from Share 1 and reconstructs the secret by prompting for Share 2.");

        const secret = "shamir-standalone-secret-123";
        let payloads = [];
        let standaloneHtmlSheet1 = "";

        await test.step("Generate 2-of-2 split and extract Share 1 standalone code", async () => {
            await page.goto(INDEX_URL);
            await page.click("#tab-share");
            await page.fill("#p-desc", "Standalone Share");
            await page.fill("#p-secret", secret);
            await page.selectOption("#p-total", "2");
            await page.selectOption("#p-threshold", "2");
            await page.click("#p-go");
            await expect(page.locator("#preview")).toHaveClass(/show/);

            payloads = await page.locator("#sheets .sh-payload").allTextContents();
            standaloneHtmlSheet1 = await page.locator(".sh-code").first().textContent();
        });

        await test.step("Execute Share 1 standalone HTML and supply Share 2 via prompt()", async () => {
            page.once("dialog", async (dialog) => {
                expect(dialog.type()).toBe("prompt");
                await dialog.accept(payloads[1]);
            });
            await page.setContent(standaloneHtmlSheet1, { waitUntil: "load" });
            await page.evaluate(() => {
                if (typeof window.onload === "function") window.onload();
            });
            await expect(page.locator("body")).toHaveText(secret);
        });
    });

    test("7. Theme toggle (Light / Dark)", async ({ page }) => {
        describeTest("Checks that clicking the theme button toggles the [data-theme=dark] attribute on the root HTML element.");

        await page.goto(INDEX_URL);
        const html = page.locator("html");
        await expect(html).not.toHaveAttribute("data-theme");

        await page.click("#theme-toggle");
        await expect(html).toHaveAttribute("data-theme", "dark");

        await page.click("#theme-toggle");
        await expect(html).not.toHaveAttribute("data-theme");
    });
});
