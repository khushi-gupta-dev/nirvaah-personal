const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const mongoose = require("mongoose");
const Otp = require("../models/Otp");
const errorHandler = require("../middleware/errorHandler");
const { sendOtpEmail } = require("../config/mailer");

const projectPath = (...parts) => path.join(__dirname, "..", ...parts);

const callErrorHandler = (error, environment) => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousConsoleError = console.error;
  let response;
  process.env.NODE_ENV = environment;
  console.error = () => {};

  try {
    errorHandler(error, { method: "GET", originalUrl: "/api/example" }, {
      headersSent: false,
      status(code) {
        response = { status: code };
        return this;
      },
      json(body) {
        response.body = body;
        return this;
      },
    }, (nextError) => { throw nextError; });
  } finally {
    console.error = previousConsoleError;
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
  }

  return response;
};

test("production 500 responses do not reveal internal errors or stacks", () => {
  const response = callErrorHandler(
    new Error("Mongo connection string contains private details"),
    "production",
  );

  assert.equal(response.status, 500);
  assert.equal(response.body.message, "An unexpected error occurred. Please try again later.");
  assert.equal("stack" in response.body, false);
  assert.doesNotMatch(JSON.stringify(response.body), /private details/);
});

test("production validation errors return a safe client message", () => {
  const error = new Error("Internal schema field validation failed");
  error.name = "ValidationError";
  error.errors = { privateField: { message: "Private schema detail" } };

  const response = callErrorHandler(error, "production");

  assert.equal(response.status, 400);
  assert.equal(response.body.message, "Please check the submitted information.");
  assert.doesNotMatch(JSON.stringify(response.body), /private/i);
});

test("development errors retain their stack for debugging", () => {
  const response = callErrorHandler(new Error("Development detail"), "development");
  assert.match(response.body.stack, /Development detail/);
});

test("OTP model stores an HMAC hash and expires sessions with a TTL index", () => {
  assert.equal(Otp.schema.path("otpHash").options.select, false);
  assert.equal(Otp.schema.path("sessionId").options.unique, true);
  const ttlIndex = Otp.schema.indexes().find(([fields]) => fields.expiresAt === 1);
  assert.ok(ttlIndex);
  assert.equal(ttlIndex[1].expireAfterSeconds, 0);

  const otp = new Otp({
    sessionId: `otp_${"a".repeat(48)}`,
    user: new mongoose.Types.ObjectId(),
    accountType: "admin",
    accountModel: "Admin",
    otpHash: "b".repeat(64),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });
  assert.equal(otp.validateSync(), undefined);
});

test("PWA manifest icons exist and can be cached by the root worker", () => {
  const manifest = JSON.parse(fs.readFileSync(projectPath("public/pwa/manifest.json"), "utf8"));
  const worker = fs.readFileSync(projectPath("public/sw.js"), "utf8");

  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.length >= 2);
  for (const icon of manifest.icons) {
    const relativePath = icon.src.replace(/^\/+/, "").split("/");
    assert.ok(fs.existsSync(projectPath("public", ...relativePath)), `${icon.src} should exist`);
    assert.ok(worker.includes(icon.src), `${icon.src} should be precached`);
  }
});

test("OTP email delivery fails closed when SMTP settings are missing", async () => {
  const smtpKeys = ["SMTP_USER", "SMTP_PASS", "SMTP_HOST"];
  const previousValues = Object.fromEntries(smtpKeys.map((key) => [key, process.env[key]]));
  smtpKeys.forEach((key) => delete process.env[key]);

  try {
    await assert.rejects(
      sendOtpEmail("citizen@example.com", "1234"),
      /OTP email is not configured/,
    );
  } finally {
    for (const key of smtpKeys) {
      if (previousValues[key] === undefined) delete process.env[key];
      else process.env[key] = previousValues[key];
    }
  }
});
