/**
 * Admin Controller
 * Analytics, complaint management, priority assignment
 */
const Complaint = require("../models/Complaint");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { createNotification } = require("./notificationController");

// @route   GET /api/admin/complaints
// @access  Admin only
exports.getAllComplaints = async (req, res, next) => {
  try {
    const {
      category,
      status,
      priority,
      search,
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (search) query.title = { $regex: search, $options: "i" };

    const sort = { [sortBy]: sortOrder === "asc" ? 1 : -1 };

    const complaints = await Complaint.find(query)
      .populate("user", "name email")
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Complaint.countDocuments(query);

    res.json({
      success: true,
      complaints,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   PATCH /api/admin/complaints/:id/status
// @access  Admin only
exports.updateComplaintStatus = async (req, res, next) => {
  try {
    const { status, note } = req.body;

    // 'resolved' can ONLY be set via the TRS resolution evidence endpoint.
    // The admin status dropdown intentionally excludes it; block API-level attempts too.
    const validStatuses = ["pending", "in_progress"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message:
          status === "resolved"
            ? "Complaints cannot be marked resolved via this endpoint. Use POST /api/complaints/:id/resolution (TRS) with camera evidence and GPS from a mobile device."
            : "Invalid status value. Allowed: pending, in_progress.",
      });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res
        .status(404)
        .json({ success: false, message: "Complaint not found" });
    }

    const prevStatus = complaint.status;
    complaint.status = status;
    complaint.statusHistory.push({
      status,
      changedBy: req.user.id,
      changedByModel: "Admin",
      note: note || `Status changed to ${status}`,
    });

    // If reverting from resolved back to pending/in_progress (e.g. supervisor action)
    // deduct user points and clear resolved state
    if (prevStatus === "resolved" && status !== "resolved") {
      complaint.resolvedAt = null;
      complaint.resolutionFeedback = undefined;
      await User.findByIdAndUpdate(complaint.user, {
        $inc: { resolvedCount: -1, points: -25 },
      });
    }

    await complaint.save();

    const statusLabels = {
      pending: "Pending",
      in_progress: "In Progress",
      resolved: "Resolved",
    };
    await createNotification({
      userId: complaint.user,
      title: "Complaint Status Updated",
      message: `Your complaint "${complaint.title}" status changed from ${statusLabels[prevStatus]} to ${statusLabels[status]}.`,
      type: "status_change",
      complaintId: complaint._id,
    });

    res.json({
      success: true,
      message: "Status updated and user notified",
      complaint,
    });
  } catch (error) {
    next(error);
  }
};

// @route   PATCH /api/admin/complaints/:id/note
// @access  Admin only
exports.updateComplaintAdminNote = async (req, res, next) => {
  try {
    const { note } = req.body;
    if (typeof note !== "string") {
      return res.status(400).json({ success: false, message: "Note must be text" });
    }
    if (note.length > 2000) {
      return res.status(400).json({ success: false, message: "Note cannot exceed 2000 characters" });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: "Complaint not found" });
    }

    complaint.adminNote = note.trim();
    await complaint.save();

    res.json({ success: true, message: "Admin note saved", adminNote: complaint.adminNote });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/admin/analytics
// @access  Admin only
exports.getAnalytics = async (req, res, next) => {
  try {
    // Aggregate stats
    const [
      totalStats,
      categoryStats,
      dailyStats,
      userStats,
      avgTimeResult,
      upvotesResult,
    ] = await Promise.all([
      // Total by status
      Complaint.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),

      // Total by category
      Complaint.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Daily complaints over last 30 days
      Complaint.aggregate([
        {
          $match: {
            createdAt: {
              $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Top reporters
      User.find({})
        .select("name email points complaintsCount resolvedCount")
        .sort({ points: -1 })
        .limit(5),

      // Average Resolution Time (for resolved complaints)
      Complaint.aggregate([
        { $match: { status: "resolved", resolvedAt: { $exists: true } } },
        {
          $project: {
            resolutionTime: { $subtract: ["$resolvedAt", "$createdAt"] },
          },
        },
        {
          $group: {
            _id: null,
            avgTimeMs: { $avg: "$resolutionTime" },
          },
        },
      ]),

      // Total Upvotes
      Complaint.aggregate([
        { $group: { _id: null, totalVotes: { $sum: "$voteCount" } } },
      ]),
    ]);

    // Compute totals
    const statusMap = {};
    totalStats.forEach((s) => {
      statusMap[s._id] = s.count;
    });

    const total = Object.values(statusMap).reduce((a, b) => a + b, 0);
    const pending = statusMap.pending || 0;
    const inProgress = statusMap.in_progress || 0;
    const resolved = statusMap.resolved || 0;

    // Average time in days
    const avgResolutionDays =
      avgTimeResult.length > 0 && avgTimeResult[0].avgTimeMs
        ? (avgTimeResult[0].avgTimeMs / (1000 * 60 * 60 * 24)).toFixed(1)
        : 0;

    // Total votes
    const totalUpvotes =
      upvotesResult.length > 0 ? upvotesResult[0].totalVotes : 0;

    res.json({
      success: true,
      analytics: {
        overview: { total, pending, inProgress, resolved },
        byCategory: categoryStats,
        dailyTrend: dailyStats,
        topReporters: userStats,
        resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
        avgResolutionDays,
        totalUpvotes,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/admin/users
// @access  Admin only
exports.getAllUsers = async (req, res, next) => {
  try {
    const users = await User.find({})
      .select("-password")
      .sort({ createdAt: -1 });

    res.json({ success: true, users, total: users.length });
  } catch (error) {
    next(error);
  }
};
