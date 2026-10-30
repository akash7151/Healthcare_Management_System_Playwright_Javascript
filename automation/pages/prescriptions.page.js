const { expect } = require("@playwright/test");
const { primaryNav } = require("../utils/nav");
const { selectByText } = require("../utils/form");

class PrescriptionsPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async openList() {
    await primaryNav(this.page).getByRole("link", { name: "Prescriptions" }).click();
    await expect(this.page.getByRole("heading", { name: "Prescriptions" })).toBeVisible();
  }

  /**
   * @param {string} patientName
   * @param {string} medicationName
   * @param {{ dosage: string, frequency: string, duration: string, quantity: string, instructions: string }} line
   */
  async issue(patientName, medicationName, line) {
    await this.openList();
    await this.page.getByRole("link", { name: "New prescription" }).click();
    await expect(this.page.getByRole("heading", { name: "Issue prescription" })).toBeVisible();
    await selectByText(this.page.getByLabel("Patient"), patientName);
    await selectByText(this.page.getByLabel("Medication"), medicationName);
    await this.page.getByLabel("Dosage").fill(line.dosage);
    await this.page.getByLabel("Frequency").fill(line.frequency);
    await this.page.getByLabel("Duration").fill(line.duration);
    await this.page.getByLabel("Quantity").fill(line.quantity);
    await this.page.getByLabel("Instructions").fill(line.instructions);
    await this.page.getByRole("button", { name: "Issue prescription" }).click();
    await expect(this.page.getByRole("heading", { name: "Prescriptions" })).toBeVisible();
    const card = this.card(patientName);
    await expect(card).toContainText("ISSUED");
    await expect(card).toContainText(line.instructions);
    await expect(card.getByRole("button", { name: "Dispense" })).toHaveCount(0);
  }

  /**
   * @param {string} patientName
   */
  card(patientName) {
    return this.page.locator("article").filter({ hasText: patientName }).first();
  }

  /**
   * @param {string} patientName
   */
  async dispense(patientName) {
    await this.openList();
    const card = this.card(patientName);
    await expect(card).toContainText("ISSUED");
    await card.getByRole("button", { name: "Dispense" }).click();
    await expect(this.page.getByRole("status")).toContainText("Prescription dispensed and stock updated.");
    await expect(this.card(patientName)).toContainText("DISPENSED");
  }
}

module.exports = { PrescriptionsPage };
