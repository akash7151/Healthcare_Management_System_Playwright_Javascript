const { expect } = require("@playwright/test");
const { primaryNav } = require("../utils/nav");
const { selectByText } = require("../utils/form");

class RecordsPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async openList() {
    await primaryNav(this.page).getByRole("link", { name: "Records" }).click();
    await expect(this.page.getByRole("heading", { name: "Medical records" })).toBeVisible();
  }

  /**
   * @param {string} patientName
   * @param {{ notes: string, examinationNotes: string, treatmentNotes: string, code: string, description: string, systolic: string, diastolic: string, heartRate: string, temperature: string }} chart
   */
  async create(patientName, chart) {
    await this.openList();
    await this.page.getByRole("link", { name: "New encounter" }).click();
    await expect(this.page.getByRole("heading", { name: "New encounter" })).toBeVisible();
    await selectByText(this.page.getByLabel("Patient"), patientName);
    await this.page.getByLabel("Consultation notes").fill(chart.notes);
    await this.page.getByLabel("Examination notes").fill(chart.examinationNotes);
    await this.page.getByLabel("Treatment notes").fill(chart.treatmentNotes);
    await this.page.getByLabel("Diagnosis code").fill(chart.code);
    await this.page.getByLabel("Diagnosis description").fill(chart.description);
    await this.page.getByLabel("Systolic").fill(chart.systolic);
    await this.page.getByLabel("Diastolic").fill(chart.diastolic);
    await this.page.getByLabel("Heart rate").fill(chart.heartRate);
    await this.page.getByLabel("Temperature").fill(chart.temperature);
    await this.page.getByRole("button", { name: "Save encounter" }).click();
    await expect(this.page.getByRole("heading", { name: new RegExp(patientName) })).toBeVisible();
    await expect(this.page.getByText(chart.notes)).toBeVisible();
    await expect(this.page.getByText(chart.description)).toBeVisible();
    await expect(this.page.getByText(`${chart.systolic}/${chart.diastolic}`)).toBeVisible();
  }
}

module.exports = { RecordsPage };
