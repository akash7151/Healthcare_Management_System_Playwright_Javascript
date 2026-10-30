const { expect } = require("@playwright/test");

class LoginPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
    this.email = page.getByLabel("Email");
    this.password = page.getByLabel("Password");
    this.submit = page.getByRole("button", { name: "Sign in" });
  }

  async open() {
    await this.page.goto("/login");
    await expect(this.page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  }

  /**
   * @param {string} email
   * @param {string} password
   */
  async signIn(email, password) {
    await this.open();
    await this.email.fill(email);
    await this.password.fill(password);
    await this.submit.click();
  }

  /**
   * @param {string | RegExp} message
   */
  async expectError(message) {
    await expect(this.page.getByRole("alert")).toContainText(message);
  }
}

module.exports = { LoginPage };
