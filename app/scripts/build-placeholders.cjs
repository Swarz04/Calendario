const fs = require("node:fs");
const path = require("node:path");

const productionEnv = path.resolve(__dirname, "..", ".env");
const originalStatSync = fs.statSync;

fs.statSync = function statSyncWithoutProductionEnv(file, ...args) {
  if (typeof file === "string" && path.resolve(file) === productionEnv) {
    const error = new Error(`ENOENT: no such file or directory, stat '${file}'`);
    error.code = "ENOENT";
    throw error;
  }
  return originalStatSync.call(this, file, ...args);
};

Object.assign(process.env, {
  GOOGLE_CLIENT_ID: "build-client-id",
  GOOGLE_CLIENT_SECRET: "build-client-secret",
  GOOGLE_REFRESH_TOKEN: "build-refresh-token",
  GOOGLE_CALENDAR_ID: "build-calendar-id",
  ADMIN_PASSWORD_HASH: "build-password-hash",
  ADMIN_SESSION_SECRET: "build-session-secret-placeholder-32-chars",
  BOOKING_TIMEZONE: "Europe/Rome",
  BOOKING_SLOT_MINUTES: "60",
  BOOKING_MIN_NOTICE_HOURS: "0",
});
