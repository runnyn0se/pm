import { expect, test } from "@playwright/test";

// Log in via UI before each test
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
});

test("board loads with five columns", async ({ page }) => {
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
});

test("login page shown when not authenticated", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("wrong credentials shows error", async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("badpassword");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText(/invalid username or password/i)).toBeVisible();
});

test("adds a card and it persists after reload", async ({ page }) => {
  const col = page.locator('[data-testid^="column-"]').first();
  await col.getByRole("button", { name: /add a card/i }).click();
  await col.getByPlaceholder("Card title").fill("E2E test card");
  await col.getByPlaceholder("Details").fill("Added by Playwright");
  await col.getByRole("button", { name: /add card/i }).click();
  await expect(col.getByText("E2E test card").first()).toBeVisible();

  // Reload and verify persistence
  await page.reload();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]').first().getByText("E2E test card").first()).toBeVisible();
});

test("deletes a card", async ({ page }) => {
  // Add a card first
  const col = page.locator('[data-testid^="column-"]').first();
  await col.getByRole("button", { name: /add a card/i }).click();
  await col.getByPlaceholder("Card title").fill("Delete me");
  await col.getByRole("button", { name: /add card/i }).click();
  await expect(col.getByText("Delete me")).toBeVisible();

  // Delete it — find the card element, then click the button inside it
  const card = col.locator('[data-testid^="card-"]').filter({ hasText: "Delete me" }).last();
  await card.locator('button').click();
  await expect(card).not.toBeVisible();
});

test("renames a column and persists after reload", async ({ page }) => {
  const col = page.locator('[data-testid^="column-"]').first();
  const input = col.getByLabel("Column title");
  await input.clear();
  await input.fill("Renamed Col");
  await input.blur();
  await expect(input).toHaveValue("Renamed Col");

  await page.reload();
  await expect(page.locator('[data-testid^="column-"]').first()).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]').first().getByLabel("Column title")).toHaveValue("Renamed Col");
});

test("sign out returns to login page", async ({ page }) => {
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("drag card to another column", async ({ page }) => {
  const col1 = page.locator('[data-testid^="column-"]').nth(0);
  const col2 = page.locator('[data-testid^="column-"]').nth(1);

  await col1.getByRole("button", { name: /add a card/i }).click();
  await col1.getByPlaceholder("Card title").fill("Drag me");
  await col1.getByRole("button", { name: /add card/i }).click();
  await expect(col1.getByText("Drag me").first()).toBeVisible();

  // Find the last "Drag me" card and drag from its title (h4 — non-interactive, so dnd-kit will handle it)
  const card = col1.locator('[data-testid^="card-"]').filter({ hasText: "Drag me" }).last();
  const titleEl = card.locator("h4");
  const titleBox = await titleEl.boundingBox();
  const col2Box = await col2.boundingBox();
  if (!titleBox || !col2Box) throw new Error("Could not get bounding boxes");

  const startX = titleBox.x + titleBox.width / 2;
  const startY = titleBox.y + titleBox.height / 2;
  const endX = col2Box.x + col2Box.width / 2;
  const endY = col2Box.y + col2Box.height / 2;

  // Move to the card title and press down, then immediately start moving
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Move enough to exceed dnd-kit's activationConstraint: { distance: 6 }
  await page.mouse.move(startX + 10, startY, { steps: 3 });
  // Now move to destination
  await page.mouse.move(endX, endY, { steps: 40 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(500);

  // Card should now be in col2
  await expect(col2.getByText("Drag me").first()).toBeVisible({ timeout: 8000 });
});
