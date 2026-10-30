const { expect } = require("@playwright/test");

/**
 * @param {import("@playwright/test").Locator} select
 * @param {string} text
 */
async function selectByText(select, text) {
  const option = select.locator("option", { hasText: text });
  await expect(option).toHaveCount(1);
  const value = await option.getAttribute("value");
  if (!value) {
    throw new Error(`No option value for ${text}`);
  }
  await select.selectOption(value);
}

module.exports = { selectByText };
