const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const errorHandler = require("../middleware/errorHandler");
const authRoutes = require("../routes/auth");

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

test("auth routes retain password login and no longer expose OTP endpoints", () => {
  const routes = authRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  assert.ok(routes.includes("/login"));
  assert.ok(!routes.some((route) => /otp/i.test(route)));
});

test("citizen and admin login pages submit password login without OTP UI", () => {
  for (const view of ["views/login.ejs", "views/admin-login.ejs"]) {
    const contents = fs.readFileSync(projectPath(view), "utf8");
    assert.match(contents, /Auth\.login\(email, password\)/);
    assert.doesNotMatch(contents, /OTP|sendOtp|verifyOtp|resendOtp/i);
  }
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
