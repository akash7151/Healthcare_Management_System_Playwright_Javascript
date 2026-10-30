const { expect } = require("@playwright/test");
const { primaryNav } = require("../utils/nav");

class DashboardPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async expectLoaded() {
    await expect(this.page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(this.page.getByText("Registered patients")).toBeVisible();
  }

  async open() {
    await primaryNav(this.page).getByRole("link", { name: "Dashboard" }).click();
    await this.expectLoaded();
  }

  async expectSignedInAs(user) {
    await expect(this.page.getByText(`${user.firstName} ${user.lastName}`, { exact: true })).toBeVisible();
    await expect(this.page.getByText(user.role, { exact: true })).toBeVisible();
  }

  async logout() {
    await this.page.getByRole("button", { name: "Log out" }).click();
    await expect(this.page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  }
}

module.exports = { DashboardPage };
