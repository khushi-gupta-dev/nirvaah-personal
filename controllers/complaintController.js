/**
 * Complaint Controller
 * Full CRUD + voting + AI suggestion + duplicate detection
 */
const Complaint = require("../models/Complaint");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const { createNotification } = require("./notificationController");

// =============================================
// AI Category Suggestion (Mock Implementation)
// In production, integrate with Google Vision API or TensorFlow.js
// =============================================
const suggestCategory = (description = "", filename = "") => {
  const text = (description + " " + filename).toLowerCase();
  const categoryMap = {
    pothole: ["pothole", "hole", "road", "crack", "bump", "pit"],
    garbage: ["garbage", "trash", "waste", "litter", "dump", "rubbish", "bin"],
    water_leakage: [
      "water",
      "leak",
      "pipe",
      "flood",
      "drain",
      "sewage",
      "overflow",
    ],
    electricity: [
      "electric",
      "light",
      "power",
      "wire",
      "transformer",
      "outage",
    ],
    street_light: ["streetlight", "street light", "lamp", "dark", "bulb"],
    tree_hazard: ["tree", "branch", "fallen", "root", "plant"],
    graffiti: ["graffiti", "vandal", "spray", "paint", "wall"],
    road_damage: ["road", "damage", "asphalt", "pavement", "divider"],
  };

  for (const [category, keywords] of Object.entries(categoryMap)) {
    if (keywords.some((kw) => text.includes(kw))) return category;
  }
  return "other";
};

// =============================================
// Duplicate Detection (within 500m radius, same category)
// =============================================
const detectDuplicate = async (coordinates, category, excludeId = null) => {
  const query = {
    location: {
      $nearSphere: {
        $geometry: { type: "Point", coordinates },
        $maxDistance: 100, // 100 meters
      },
    },
    category,
    status: { $in: ["pending", "in_progress"] },
  };
  if (excludeId) query._id = { $ne: excludeId };

  const similar = await Complaint.findOne(query).select("_id title");
  return similar;
};

// @route   POST /api/complaints
// @access  Protected
exports.createComplaint = async (req, res, next) => {
  try {
    const { title, description, category, lat, lng, address, landmark } =
      req.body;

    if (!lat || !lng) {
      return res
        .status(400)
        .json({ success: false, message: "Location coordinates are required" });
    }

    const coordinates = [parseFloat(lng), parseFloat(lat)]; // GeoJSON: [lng, lat]

    // Require at least one image attachment
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "At least one image is required" });
    }

    // Process uploaded images
    const images = req.files.map((f) => ({
      url: f.path,
      publicId: f.filename,
    }));

    // AI category suggestion
    const aiSuggested = suggestCategory(
      description,
      req.files[0]?.originalname || "",
    );

    // Duplicate detection
    const duplicate = await detectDuplicate(
      coordinates,
      category || aiSuggested,
    );

    const complaint = await Complaint.create({
      title,
      description,
      category: category || aiSuggested,
      aiSuggestedCategory: aiSuggested,
      images,
      location: {
        type: "Point",
        coordinates,
        address: address || "",
        landmark: landmark || "",
      },
      user: req.user.id,
      isDuplicate: !!duplicate,
      duplicateOf: duplicate ? duplicate._id : null,
      statusHistory: [
        {
          status: "pending",
          changedBy: req.user.id,
          note: "Complaint submitted",
        },
      ],
    });

    // Award points to user (+10 for filing a complaint)
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { points: 10, complaintsCount: 1 },
    });

    await complaint.populate("user", "name email avatar");

    // Update priority and deadline for new complaint
    const PriorityService = require("../services/priorityService");
    await PriorityService.updatePriorityAndDeadline(complaint._id);

    res.status(201).json({
      success: true,
      message: "Complaint submitted successfully",
      complaint,
      duplicate: duplicate
        ? {
            detected: true,
            existingId: duplicate._id,
            existingTitle: duplicate.title,
          }
        : { detected: false },
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/complaints
// @access  Public (filtered list)
exports.getComplaints = async (req, res, next) => {
  try {
    const {
      category,
      status,
      page = 1,
      limit = 10,
      lat,
      lng,
      radius = 5000, // radius in meters, default 5km
    } = req.query;

    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;

    let complaints;

    if (lat && lng) {
      // Geospatial query — find complaints within radius
      complaints = await Complaint.find({
        ...query,
        location: {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: [parseFloat(lng), parseFloat(lat)],
            },
            $maxDistance: parseInt(radius),
          },
        },
      })
        .populate("user", "name avatar")
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    } else {
      complaints = await Complaint.find(query)
        .populate("user", "name avatar")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));
    }

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

// @route   GET /api/complaints/map
// @access  Public (for map markers)
exports.getMapComplaints = async (req, res, next) => {
  try {
    // Return minimal data needed for map markers
    const complaints = await Complaint.find({})
      .select("title category status location voteCount priority")
      .limit(500)
      .lean();

    res.json({ success: true, complaints });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/complaints/my
// @access  Protected
exports.getMyComplaints = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = { user: req.user.id };
    if (status) query.status = status;

    const complaints = await Complaint.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Complaint.countDocuments(query);

    res.json({
      success: true,
      complaints,
      pagination: {
        page: parseInt(page),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/complaints/:id
// @access  Public
exports.getComplaintById = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id)
      .select("-resolutionFeedback")
      .populate("user", "name email avatar")
      .populate("statusHistory.changedBy", "name")
      .populate("duplicateOf", "title status");

    if (!complaint) {
      return res
        .status(404)
        .json({ success: false, message: "Complaint not found" });
    }

    res.json({ success: true, complaint });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/complaints/:id/vote
// @access  Protected
exports.voteComplaint = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res
        .status(404)
        .json({ success: false, message: "Complaint not found" });
    }

    // Prevent author from voting on own complaint
    if (complaint.user.toString() === req.user.id) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot vote on your own complaint" });
    }

    const hasVoted = complaint.votes.includes(req.user.id);

    if (hasVoted) {
      // Remove vote (toggle off)
      complaint.votes = complaint.votes.filter(
        (v) => v.toString() !== req.user.id,
      );
      complaint.voteCount = Math.max(0, complaint.voteCount - 1);

      // Deduct points from complaint owner (-2 per vote removed)
      await User.findByIdAndUpdate(complaint.user, { $inc: { points: -2 } });
    } else {
      // Add vote
      complaint.votes.push(req.user.id);
      complaint.voteCount += 1;

      // Award points to complaint owner (+2 per vote received)
      await User.findByIdAndUpdate(complaint.user, { $inc: { points: 2 } });

      // Notify owner
      await createNotification({
        userId: complaint.user,
        title: "New Upvote!",
        message: `Your complaint "${complaint.title}" received an upvote! You earned +2 points.`,
        type: "vote_received",
        complaintId: complaint._id,
      });
    }

    complaint.computePriorityScore();
    await complaint.save();

    // Update priority and deadline based on new vote count
    const PriorityService = require("../services/priorityService");
    await PriorityService.updatePriorityAndDeadline(complaint._id);

    res.json({
      success: true,
      voted: !hasVoted,
      voteCount: complaint.voteCount,
      priorityScore: complaint.priorityScore,
    });
  } catch (error) {
    next(error);
  }
};

// @route   DELETE /api/complaints/:id
// @access  Protected (owner or admin)
exports.deleteComplaint = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res
        .status(404)
        .json({ success: false, message: "Complaint not found" });
    }

    if (
      complaint.user.toString() !== req.user.id &&
      req.accountType !== "admin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this complaint",
      });
    }

    // Delete images from Cloudinary
    for (const img of complaint.images) {
      if (img.publicId) {
        await cloudinary.uploader.destroy(img.publicId);
      }
    }

    // Deduct points: 10 base points + (2 points per vote received)
    let pointsToDeduct = 10 + complaint.voteCount * 2;
    let resolvedCountToDeduct = 0;

    if (complaint.status === "resolved") {
      pointsToDeduct += 25;
      resolvedCountToDeduct = -1;
    }

    const updates = {
      points: -pointsToDeduct,
      complaintsCount: -1,
    };
    if (resolvedCountToDeduct !== 0) {
      updates.resolvedCount = resolvedCountToDeduct;
    }

    await User.findByIdAndUpdate(complaint.user, {
      $inc: updates,
    });

    await complaint.deleteOne();
    res.json({ success: true, message: "Complaint deleted successfully" });
  } catch (error) {
    next(error);
  }
};
