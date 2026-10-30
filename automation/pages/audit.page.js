const { expect } = require("@playwright/test");
const { primaryNav } = require("../utils/nav");

class AuditPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async open() {
    await primaryNav(this.page).getByRole("link", { name: "Audit log" }).click();
    await expect(this.page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  }

  /**
   * @param {string} action
   */
  async expectAction(action) {
    await this.open();
    await this.page.getByPlaceholder("Filter by action or entity").fill(action);
    await expect(this.page.getByRole("cell", { name: action }).first()).toBeVisible();
  }
}

module.exports = { AuditPage };
