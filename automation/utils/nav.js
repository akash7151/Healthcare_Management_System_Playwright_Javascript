function primaryNav(page) {
  return page.getByRole("navigation", { name: "Primary" });
}

module.exports = { primaryNav };
