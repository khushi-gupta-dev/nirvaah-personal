/**
 * EJS Page Routes
 * These render views - no auth logic here (auth is done client-side via JWT)
 * Protected pages check for token in the EJS template / client JS
 */
const express = require("express");
const router = express.Router();

// ── Public pages ──────────────────────────────────
router.get("/", (req, res) =>
  res.render("index", { title: "NIRVAAH – Smart Civic Reporting" }),
);
router.get("/login", (req, res) =>
  res.render("login", { title: "Login – NIRVAAH" }),
);
router.get("/otp", (req, res) =>
  res.render("otp", { title: "OTP Verification – NIRVAAH" }),
);
router.get("/register", (req, res) =>
  res.render("register", { title: "Register – NIRVAAH" }),
);
router.get("/map", (req, res) =>
  res.render("map", { title: "Live Map – NIRVAAH", navPage: "map" }),
);
router.get("/leaderboard", (req, res) =>
  res.render("leaderboard", {
    title: "Leaderboard – NIRVAAH",
    navPage: "leaderboard",
  }),
);
router.get("/terms", (req, res) =>
  res.render("terms", {
    title: "Terms and Conditions – NIRVAAH",
    navPage: "terms",
  }),
);

// ── Protected citizen pages ────────────────────────
router.get("/dashboard", (req, res) =>
  res.render("dashboard", {
    title: "Dashboard – NIRVAAH",
    navPage: "dashboard",
  }),
);
router.get("/report", (req, res) =>
  res.render("report", { title: "Report Issue – NIRVAAH", navPage: "report" }),
);
router.get("/my-complaints", (req, res) =>
  res.render("my-complaints", {
    title: "My Reports – NIRVAAH",
    navPage: "mycomplaints",
  }),
);
router.get("/complaint", (req, res) =>
  res.render("complaint", {
    title: "Complaint – NIRVAAH",
    navPage: "mycomplaints",
  }),
);
router.get("/notifications", (req, res) =>
  res.render("notifications", {
    title: "Notifications – NIRVAAH",
    navPage: "notifications",
  }),
);
router.get("/profile", (req, res) =>
  res.render("profile", { title: "Profile – NIRVAAH", navPage: "profile" }),
);
router.get("/nearby", (req, res) =>
  res.render("nearby", {
    title: "Nearby Problems – NIRVAAH",
    navPage: "nearby",
  }),
);
router.get("/issue", (req, res) =>
  res.render("issue", { title: "Issue Details – NIRVAAH", navPage: "" }),
);

// ── Admin pages ────────────────────────────────────
router.get("/admin", (req, res) => res.redirect("/admin/login"));
router.get("/admin/login", (req, res) =>
  res.render("admin-login", { title: "Admin Login – NIRVAAH" }),
);
router.get("/admin/register", (req, res) =>
  res.render("admin-register", { title: "Admin Register – NIRVAAH" }),
);
router.get("/admin/dashboard", (req, res) =>
  res.render("admin/dashboard", {
    title: "Admin Dashboard – NIRVAAH",
    navPage: "admin-dash",
  }),
);
router.get("/admin/complaints", (req, res) =>
  res.render("admin/complaints", {
    title: "Manage Complaints – NIRVAAH",
    navPage: "admin-complaints",
  }),
);
router.get("/admin/complaint", (req, res) =>
  res.render("admin/complaint", {
    title: "Complaint Detail – NIRVAAH",
    navPage: "admin-complaints",
    gpsAccuracyLimit: parseInt(process.env.TRS_GPS_ACCURACY_MAX_M, 10) || 150,
    gpsDistanceLimit: parseInt(process.env.TRS_DISTANCE_THRESHOLD_M, 10) || 100,
  }),
);
router.get("/admin/analytics", (req, res) =>
  res.render("admin/analytics", {
    title: "Analytics – NIRVAAH",
    navPage: "admin-analytics",
  }),
);
router.get("/admin/priority-dashboard", (req, res) =>
  res.render("admin/priority-dashboard", {
    title: "Priority Dashboard – NIRVAAH",
    navPage: "priority-dashboard",
  }),
);
router.get("/admin/map", (req, res) =>
  res.render("admin/map", {
    title: "Admin Live Map – NIRVAAH",
    navPage: "admin-map",
  }),
);
router.get("/admin/leaderboard", (req, res) =>
  res.render("admin/leaderboard", {
    title: "Admin Leaderboard – NIRVAAH",
    navPage: "admin-leaderboard",
  }),
);

// 404
router.use((req, res) =>
  res.status(404).render("404", { title: "404 – NIRVAAH" }),
);

module.exports = router;
