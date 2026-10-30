const { expect } = require("@playwright/test");
const { selectByText } = require("../utils/form");

class AppointmentsPage {
  /**
   * @param {import("@playwright/test").Page} page
   */
  constructor(page) {
    this.page = page;
  }

  async openBooking() {
    await this.page.goto("/appointments/new");
    await expect(this.page.getByRole("heading", { name: "Book appointment" })).toBeVisible();
  }

  /**
   * @param {string} patientName
   */
  async selectPatient(patientName) {
    await selectByText(this.page.getByLabel("Patient"), patientName);
  }

  /**
   * @param {string} doctorName
   */
  async selectDoctor(doctorName) {
    await selectByText(this.page.getByLabel("Doctor"), doctorName);
  }

  async chooseOpenSlot() {
    const available = this.page.locator('input[type="radio"]:not([disabled])').first();
    await expect(available).toBeVisible();
    await available.check();
  }

  /**
   * @param {{ patientName: string, doctorName: string, date: string, reason: string }} visit
   */
  async book(visit) {
    await this.openBooking();
    await this.selectPatient(visit.patientName);
    await this.selectDoctor(visit.doctorName);
    await this.page.getByLabel("Date").fill(visit.date);
    await this.chooseOpenSlot();
    await this.page.getByLabel("Reason").fill(visit.reason);
    await this.page.getByRole("button", { name: "Book appointment" }).click();
    await expect(this.page.getByRole("heading", { name: "Appointment" })).toBeVisible();
    await expect(this.page.getByText(visit.reason)).toBeVisible();
    await expect(this.page).toHaveURL(/\/appointments\/(?!new$)[^/]+$/);
    return this.page.url();
  }

  /**
   * @param {{ patientName: string, doctorName: string, date: string }} visit
   */
  async expectSlotAlreadyBooked(visit) {
    await this.openBooking();
    await this.selectPatient(visit.patientName);
    await this.selectDoctor(visit.doctorName);
    await this.page.getByLabel("Date").fill(visit.date);
    await expect(this.page.getByText("(booked)").first()).toBeVisible();
    await expect(this.page.locator('input[type="radio"]:not([disabled])').first()).toBeVisible();
  }

  /**
   * @param {string} appointmentUrl
   */
  async open(appointmentUrl) {
    await this.page.goto(appointmentUrl);
    await expect(this.page.getByRole("heading", { name: "Appointment" })).toBeVisible();
  }

  /**
   * @param {string} date
   */
  async reschedule(date) {
    await this.page.getByRole("link", { name: "Reschedule" }).click();
    await expect(this.page.getByRole("heading", { name: "Reschedule" })).toBeVisible();
    await this.page.getByLabel("New date").fill(date);
    await this.chooseOpenSlot();
    await this.page.getByRole("button", { name: "Save new time" }).click();
    await expect(this.page.getByRole("heading", { name: "Appointment" })).toBeVisible();
  }

  async advanceToCompleted() {
    for (const label of ["CONFIRMED", "CHECKED IN", "IN PROGRESS", "COMPLETED"]) {
      await this.page.getByRole("button", { name: label, exact: true }).click();
      await expect(this.page.getByRole("status")).toContainText("Status is now");
    }
    await expect(this.page.getByText("Status: COMPLETED")).toBeVisible();
  }
}

module.exports = { AppointmentsPage };


