const { expect } = require("@playwright/test");
const { primaryNav } = require("../utils/nav");

class PatientsPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async openList() {
    await primaryNav(this.page).getByRole("link", { name: "Patients" }).click();
    await expect(this.page.getByRole("heading", { name: "Patients" })).toBeVisible();
  }

  async startRegistration() {
    await this.page.getByRole("link", { name: "Register patient" }).click();
    await expect(this.page.getByRole("heading", { name: "Register patient" })).toBeVisible();
  }

  /**
   * @param {{ firstName: string, lastName: string, dateOfBirth: string, sex: string, phone: string, email: string, addressLine: string, city: string }} patient
   */
  async fill(patient) {
    await this.page.getByLabel("First name").fill(patient.firstName);
    await this.page.getByLabel("Last name").fill(patient.lastName);
    await this.page.getByLabel("Date of birth").fill(patient.dateOfBirth);
    await this.page.getByLabel("Sex").selectOption(patient.sex);
    await this.page.getByLabel("Phone").fill(patient.phone);
    await this.page.getByLabel("Email").fill(patient.email);
    await this.page.getByLabel("Address").fill(patient.addressLine);
    await this.page.getByLabel("City").fill(patient.city);
  }

  async save() {
    await this.page.getByRole("button", { name: "Save patient" }).click();
  }

  /**
   * @param {string} fullName
   */
  async expectProfile(fullName) {
    await expect(this.page.getByRole("heading", { name: fullName })).toBeVisible();
  }

  /**
   * @param {string} firstName
   * @param {string} city
   */
  async editCity(firstName, city) {
    await this.page.getByRole("link", { name: "Edit" }).click();
    await expect(this.page.getByRole("heading", { name: "Edit patient" })).toBeVisible();
    await expect(this.page.getByLabel("First name")).toHaveValue(firstName);
    await this.page.getByLabel("City").fill(city);
    await this.save();
  }

  /**
   * @param {string} phone
   */
  async search(phone) {
    await this.openList();
    await this.page.getByPlaceholder("Search by ID, name, phone, or email").fill(phone);
    await this.page.getByRole("button", { name: "Search" }).click();
    await expect(this.page.getByRole("cell", { name: phone })).toBeVisible();
  }
}

module.exports = { PatientsPage };
