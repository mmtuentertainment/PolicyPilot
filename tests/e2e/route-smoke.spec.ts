import { expect, test } from "@playwright/test";

test.describe("route smoke", () => {
  test("public and protected routes respond according to auth contract", async ({
    page,
  }) => {
    const publicRoutes = ["/", "/pricing"];
    for (const path of publicRoutes) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBe(200);
      await expect(page, path).toHaveTitle(/PolicyPilot/);
    }

    const employeeRoutes = ["/my-policies", "/my-policies/ask", "/post-sign-in"];
    for (const path of employeeRoutes) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBe(200);
      expect(new URL(page.url()).pathname, path).toBe("/sign-in");
    }

    const adminRoutes = ["/policies", "/policies/new"];
    for (const path of adminRoutes) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status(), path).toBe(404);
      expect(new URL(page.url()).pathname, path).toBe(path);
    }
  });
});
