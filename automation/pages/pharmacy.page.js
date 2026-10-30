const { expect } = require("@playwright/test");
const { primaryNav } = require("../utils/nav");
const { selectByText } = require("../utils/form");

class PharmacyPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async open() {
    await primaryNav(this.page).getByRole("link", { name: "Pharmacy" }).click();
    await expect(this.page.getByRole("heading", { name: "Pharmacy" })).toBeVisible();
  }

  /**
   * @param {{ name: string, strength: string, form: string, batch: string, quantity: number, expiry: string, location: string }} medication
   */
  async addAndReceive(medication) {
    await this.open();
    await this.page.getByLabel("Name").fill(medication.name);
    await this.page.getByLabel("Strength").fill(medication.strength);
    await this.page.getByLabel("Form").fill(medication.form);
    await this.page.getByRole("button", { name: "Add to catalog" }).click();
    await expect(this.page.getByRole("status")).toContainText("Medication added.");
    await selectByText(this.page.getByLabel("Medication"), medication.name);
    await this.page.getByLabel("Batch").fill(medication.batch);
    await this.page.getByLabel("Quantity").fill(String(medication.quantity));
    await this.page.getByLabel("Expiry").fill(medication.expiry);
    await this.page.getByLabel("Location").fill(medication.location);
    await this.page.getByRole("button", { name: "Receive batch" }).click();
    await expect(this.page.getByRole("status")).toContainText("Stock received.");
    await this.expectOnHand(medication.name, medication.quantity);
  }

  /**
   * @param {string} name
   * @param {number} quantity
   */
  async expectOnHand(name, quantity) {
    await expect(this.page.getByRole("row", { name: new RegExp(name) })).toContainText(String(quantity));
  }
}

module.exports = { PharmacyPage };
