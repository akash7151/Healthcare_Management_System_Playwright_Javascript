const { expect } = require("@playwright/test");
const { primaryNav } = require("../utils/nav");

class UsersPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async open() {
    await primaryNav(this.page).getByRole("link", { name: "Users" }).click();
    await expect(this.page.getByRole("heading", { name: "Users" })).toBeVisible();
  }

  /**
   * @param {{ email: string, password: string, firstName: string, lastName: string, role: string }} staff
   */
  async createAndToggle(staff) {
    await this.open();
    await this.page.getByLabel("First name").fill(staff.firstName);
    await this.page.getByLabel("Last name").fill(staff.lastName);
    await this.page.getByLabel("Email").fill(staff.email);
    await this.page.getByLabel("Password").fill(staff.password);
    await this.page.getByLabel("Role").selectOption(staff.role);
    await this.page.getByRole("button", { name: "Create user" }).click();
    await expect(this.page.getByRole("status")).toContainText("User created.");

    await this.page.getByPlaceholder("Search name or email").fill(staff.email);
    await this.page.getByRole("button", { name: "Search" }).click();
    const row = () => this.page.getByRole("row", { name: staff.email });
    await expect(row().getByRole("cell", { name: "ACTIVE" })).toBeVisible();
    await row().getByRole("button", { name: "Deactivate" }).click();
    await this.page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
    await expect(row().getByRole("cell", { name: "DISABLED" })).toBeVisible();
    await row().getByRole("button", { name: "Activate" }).click();
    await expect(this.page.getByRole("status")).toContainText("Account marked ACTIVE.");
    await expect(row().getByRole("cell", { name: "ACTIVE" })).toBeVisible();
  }
}

module.exports = { UsersPage };
