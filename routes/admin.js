/**
 * Admin Routes (all protected + admin-only)
 * GET    /api/admin/complaints                   - All complaints with filters
 * PATCH  /api/admin/complaints/:id/status        - Update status
 * PATCH  /api/admin/complaints/:id/priority      - Update priority
 * GET    /api/admin/analytics                    - Analytics data
 * GET    /api/admin/users                        - All users
 */
const express = require("express");
const router = express.Router();
const {
  getAllComplaints,
  updateComplaintStatus,
  updateComplaintAdminNote,
  getAnalytics,
  getAllUsers,
} = require("../controllers/adminController");
const { protect } = require("../middleware/auth");
const { adminOnly } = require("../middleware/admin");

// All admin routes require authentication + admin role
router.use(protect, adminOnly);

router.get("/complaints", getAllComplaints);
router.patch("/complaints/:id/status", updateComplaintStatus);
router.patch("/complaints/:id/note", updateComplaintAdminNote);

router.get("/analytics", getAnalytics);
router.get("/users", getAllUsers);

module.exports = router;
