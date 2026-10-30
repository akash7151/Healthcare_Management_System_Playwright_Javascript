const { expect } = require("@playwright/test");
const { primaryNav } = require("../utils/nav");

class DoctorsPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async openList() {
    await primaryNav(this.page).getByRole("link", { name: "Doctors" }).click();
    await expect(this.page.getByRole("heading", { name: "Doctors" })).toBeVisible();
  }

  /**
   * @param {{ firstName: string, lastName: string, fullName: string, email: string, password: string, licenseNumber: string, specialty: string, department: string, qualification: string }} doctor
   */
  async create(doctor) {
    await this.openList();
    await this.page.getByRole("link", { name: "Add doctor" }).click();
    await expect(this.page.getByRole("heading", { name: "Add doctor" })).toBeVisible();
    await this.page.getByLabel("First name").fill(doctor.firstName);
    await this.page.getByLabel("Last name").fill(doctor.lastName);
    await this.page.getByLabel("Email").fill(doctor.email);
    await this.page.getByLabel("Password").fill(doctor.password);
    await this.page.getByLabel("License").fill(doctor.licenseNumber);
    await this.page.getByLabel("Specialty").fill(doctor.specialty);
    await this.page.getByLabel("Department").fill(doctor.department);
    await this.page.getByLabel("Qualification").fill(doctor.qualification);
    await this.page.getByRole("button", { name: "Save doctor" }).click();
    await expect(this.page.getByRole("heading", { name: doctor.fullName })).toBeVisible();
    await expect(this.page.getByText(doctor.licenseNumber)).toBeVisible();
    await expect(this.page.getByText(/Mon 09:00/)).toBeVisible();
  }

  /**
   * @param {string} licenseNumber
   * @param {string} fullName
   */
  async find(licenseNumber, fullName) {
    await this.openList();
    await this.page.getByPlaceholder("Search name, specialty, or license").fill(licenseNumber);
    await this.page.getByRole("button", { name: "Search" }).click();
    await expect(this.page.getByRole("cell", { name: fullName })).toBeVisible();
    await this.page.getByRole("row", { name: fullName }).getByRole("link", { name: "Open" }).click();
    await expect(this.page.getByRole("heading", { name: fullName })).toBeVisible();
  }
}

module.exports = { DoctorsPage };
