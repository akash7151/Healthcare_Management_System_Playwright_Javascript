const fs = require("fs");
const { expect } = require("@playwright/test");
const { primaryNav } = require("../utils/nav");

class ReportsPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async open() {
    await primaryNav(this.page).getByRole("link", { name: "Reports" }).click();
    await expect(this.page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await expect(this.page.getByText("Invoices", { exact: true })).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "Appointments" })).toBeVisible();
    await expect(this.page.getByRole("heading", { name: "Pharmacy" })).toBeVisible();
  }

  /**
   * @param {string} patientName
   */
  async downloadPatients(patientName) {
    const downloadPromise = this.page.waitForEvent("download");
    await this.page.getByRole("link", { name: "Download patients CSV" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe("patients.csv");
    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    expect(fs.readFileSync(filePath, "utf8")).toContain(patientName);
    await this.page.goto("/");
  }
}

module.exports = { ReportsPage };
