const { expect } = require("@playwright/test");
const { primaryNav } = require("../utils/nav");
const { selectByText } = require("../utils/form");

class BillingPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async openList() {
    await primaryNav(this.page).getByRole("link", { name: "Billing" }).click();
    await expect(this.page.getByRole("heading", { name: "Billing" })).toBeVisible();
  }

  /**
   * @param {string} patientName
   * @param {{ description: string, quantity: string, unitPrice: string, discount: string, amount: string }} invoice
   */
  async createAndPay(patientName, invoice) {
    await this.openList();
    await this.page.getByRole("link", { name: "Create invoice" }).click();
    await expect(this.page.getByRole("heading", { name: "Create invoice" })).toBeVisible();
    await selectByText(this.page.getByLabel("Patient"), patientName);
    await this.page.getByLabel("Description").fill(invoice.description);
    await this.page.getByLabel("Quantity").fill(invoice.quantity);
    await this.page.getByLabel("Unit price (INR)").fill(invoice.unitPrice);
    await this.page.getByLabel("Discount (INR)").fill(invoice.discount);
    await this.page.getByRole("button", { name: "Create invoice" }).click();
    await expect(this.page.getByRole("heading", { name: /INV-/ })).toBeVisible();
    await expect(this.page.getByText(invoice.description)).toBeVisible();
    await expect(this.page.getByText(`INR ${invoice.amount}`).first()).toBeVisible();
    await this.page.getByLabel("Amount").fill(invoice.amount);
    await this.page.getByLabel("Method").selectOption("UPI");
    await this.page.getByRole("button", { name: "Record payment" }).click();
    await expect(this.page.getByRole("status")).toContainText("Payment recorded.");
    await expect(this.page.getByText("PAID")).toBeVisible();
    await expect(this.page.getByText("Outstanding", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("INR 0.00");
  }

  /**
   * @param {string} patientName
   */
  async findPatient(patientName) {
    await this.openList();
    await this.page.getByPlaceholder("Search invoice or patient").fill(patientName);
    await this.page.getByRole("button", { name: "Search" }).click();
    await expect(this.page.getByRole("cell", { name: new RegExp(patientName) }).first()).toBeVisible();
  }
}

module.exports = { BillingPage };
