const path = require("path");

const authDir = path.join(__dirname, "..", "..", "playwright", ".auth");

function authPath(role) {
  return path.join(authDir, `${role}.json`);
}

const signedOut = { cookies: [], origins: [] };

module.exports = { authDir, authPath, signedOut };
