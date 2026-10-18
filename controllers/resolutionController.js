/**
 * Resolution Controller — Transparent Resolution System (TRS)
 *
 * POST /api/complaints/:id/resolution
 *   Admin/field officer submits camera-captured evidence with live GPS.
 *   Server stamps the timestamp; no client-provided timestamp is trusted.
 *   Haversine validates distance; > 100m → isSuspicious = true.
 *   Write-once: 409 if evidence already exists.
 *
 * PATCH /api/complaints/:id/resolution/review
 *   Admin-only supervisor review of suspicious submissions.
 *   approved → keep resolved  |  rejected → reopen complaint.
 *
 * GET /api/complaints/:id/resolution/public
 *   Public (no-auth) read of resolution evidence — precise coords stripped.
 */

const crypto = require("crypto");
const Complaint = require("../models/Complaint");
const User = require("../models/User");
const cloudinary = require("../config/cloudinary");
const { haversineDistanceMeters, isWithinIndia } = require("../utils/haversine");
const { createNotification } = require("./notificationController");

// ─── Thresholds (tunable via env) ───────────────────────────────────────────
const SUSPICIOUS_DISTANCE_M = parseInt(process.env.TRS_DISTANCE_THRESHOLD_M) || 100;
const MAX_GPS_ACCURACY_M = parseInt(process.env.TRS_GPS_ACCURACY_MAX_M) || 150;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function isMobileUA(ua = "") {
  return /mobile|android|iphone|ipad|ipod/i.test(ua);
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/complaints/:id/resolution
// Content-Type: multipart/form-data
// Fields: latitude, longitude, gpsAccuracyM, notes (optional)
// File:   image (single — camera capture only; MIME validated by multer)
// Auth:   admin only (protected + adminOnly middleware applied in router)
// ─────────────────────────────────────────────────────────────────────────────
exports.submitResolution = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ua = req.headers["user-agent"] || "";

    // ── 1. Mobile-only enforcement ──────────────────────────────────────────
    if (!isMobileUA(ua)) {
      return res.status(403).json({
        success: false,
        error: "DESKTOP_RESOLUTION_BLOCKED",
        message:
          "Resolution evidence must be submitted from a mobile device at the complaint site.",
      });
    }

    // ── 2. Required fields ──────────────────────────────────────────────────
    const lat = parseFloat(req.body.latitude);
    const lng = parseFloat(req.body.longitude);
    const accuracyM = parseFloat(req.body.gpsAccuracyM);
    const notes = (req.body.notes || "").trim().slice(0, 500);

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        success: false,
        error: "MISSING_GPS",
        message: "latitude and longitude are required.",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "MISSING_IMAGE",
        message: "A resolution image captured from the camera is required.",
      });
    }

    // ── 3. GPS accuracy check ───────────────────────────────────────────────
    if (!isNaN(accuracyM) && accuracyM > MAX_GPS_ACCURACY_M) {
      return res.status(400).json({
        success: false,
        error: "LOW_GPS_ACCURACY",
        message: `GPS accuracy ${accuracyM}m exceeds the maximum allowed ${MAX_GPS_ACCURACY_M}m. Move closer to the site.`,
      });
    }

    // ── 4. Coordinate plausibility ──────────────────────────────────────────
    if (!isWithinIndia(lat, lng)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_COORDINATES",
        message: "Coordinates are outside the expected region.",
      });
    }

    // ── 5. Load complaint + state check ────────────────────────────────────
    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: "Complaint not found." });
    }

    if (!["pending", "in_progress"].includes(complaint.status)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_COMPLAINT_STATE",
        message: `Cannot resolve a complaint with status '${complaint.status}'.`,
      });
    }

    // ── 6. Immutability check (application layer) ───────────────────────────
    if (complaint.resolutionEvidence && complaint.resolutionEvidence.submittedAt) {
      return res.status(409).json({
        success: false,
        error: "RESOLUTION_IMMUTABLE",
        message: "Resolution evidence has already been submitted and cannot be modified.",
      });
    }

    // ── 7. SHA-256 hash of the uploaded image buffer ────────────────────────
    //    req.file.buffer exists when using multer memoryStorage.
    //    When using CloudinaryStorage the file is streamed; we hash the path/url instead.
    const imageUrl = req.file.path;           // Cloudinary secure URL
    const imagePublicId = req.file.filename;       // Cloudinary public_id
    const imageHash = sha256(imageUrl + imagePublicId); // deterministic proxy hash

    // ── 8. Haversine distance validation ────────────────────────────────────
    let distanceFromOriginM = null;
    let isSuspicious = false;
    let suspicionReason = null;

    const [originLng, originLat] = complaint.location?.coordinates || [];

    if (originLat != null && originLng != null) {
      distanceFromOriginM = haversineDistanceMeters(originLat, originLng, lat, lng);
      if (distanceFromOriginM > SUSPICIOUS_DISTANCE_M) {
        isSuspicious = true;
        suspicionReason = "DISTANCE_EXCEEDED";
      }
    } else {
      // No origin coordinates on the complaint — flag suspicious
      isSuspicious = true;
      suspicionReason = "NO_ORIGIN_COORDINATES";
    }

    // ── 9. Server-side timestamp injection (client value always discarded) ──
    const serverTimestamp = new Date();

    // ── 10. Atomic write-once update ($exists guard as DB-layer defence) ────
    const newStatus = "resolved";

    const result = await Complaint.updateOne(
      {
        _id: id,
        "resolutionEvidence.submittedAt": null, // atomic immutability guard
      },
      {
        $set: {
          status: newStatus,
          resolvedAt: serverTimestamp,
          adminNote: notes || complaint.adminNote,
          resolutionEvidence: {
            imageUrl,
            imagePublicId,
            imageHash,
            submittedAt: serverTimestamp,         // ← SERVER ONLY
            captureLocation: { lat, lng, accuracyM: isNaN(accuracyM) ? null : accuracyM },
            distanceFromOriginM,
            isSuspicious,
            suspicionReason,
            supervisorReview: { reviewedBy: null, reviewedAt: null, decision: null, notes: null },
            submittedBy: req.user.id,
            submitterRole: req.user.role || "admin",
            userAgent: ua.slice(0, 300),
            notes,
          },
        },
        $push: {
          statusHistory: {
            status: newStatus,
            changedBy: req.user.id,
            changedByModel: "Admin",
            note: isSuspicious
              ? `Resolved (suspicious — ${distanceFromOriginM ?? "unknown"}m from site)`
              : `Resolved via TRS — ${distanceFromOriginM ?? "unknown"}m from site`,
            timestamp: serverTimestamp,
          },
        },
      },
    );

    if (result.modifiedCount === 0) {
      return res.status(409).json({
        success: false,
        error: "RESOLUTION_IMMUTABLE",
        message: "Resolution evidence has already been submitted.",
      });
    }

    // ── 11. Award user points + notify ─────────────────────────────────────
    const fresh = await Complaint.findById(id);
    await User.findByIdAndUpdate(fresh.user, {
      $inc: { resolvedCount: 1, points: 25 },
    });
    await createNotification({
      userId: fresh.user,
      title: "Your Complaint Has Been Resolved!",
      message: `Your complaint "${fresh.title}" has been resolved. Resolution evidence has been published.`,
      type: "status_change",
      complaintId: fresh._id,
    });

    return res.status(201).json({
      success: true,
      message: isSuspicious
        ? "Resolution submitted and flagged for supervisory review (distance > threshold)."
        : "Resolution submitted and verified successfully.",
      resolution: {
        status: newStatus,
        resolvedAt: serverTimestamp,
        distanceFromOriginM,
        isSuspicious,
        suspicionReason,
        imageUrl,
        imageHash,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/complaints/:id/resolution/review
// Body: { decision: "approved" | "rejected", notes: "..." }
// Auth: admin only
// ─────────────────────────────────────────────────────────────────────────────
exports.reviewResolution = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision, notes } = req.body;

    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({
        success: false,
        error: "INVALID_DECISION",
        message: "decision must be 'approved' or 'rejected'.",
      });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: "Complaint not found." });
    }

    if (!complaint.resolutionEvidence?.isSuspicious) {
      return res.status(400).json({
        success: false,
        error: "NOT_SUSPICIOUS",
        message: "This complaint's resolution is not flagged as suspicious.",
      });
    }

    if (complaint.resolutionEvidence?.supervisorReview?.decision) {
      return res.status(409).json({
        success: false,
        error: "REVIEW_ALREADY_DONE",
        message: "A supervisory review decision has already been recorded.",
      });
    }

    const now = new Date();
    const reviewNote = notes ? String(notes).slice(0, 500) : null;

    // If rejected → reopen the complaint so it can be re-resolved
    const newStatus = decision === "rejected" ? "in_progress" : "resolved";

    await Complaint.updateOne(
      { _id: id },
      {
        $set: {
          status: newStatus,
          "resolutionEvidence.supervisorReview": {
            reviewedBy: req.user.id,
            reviewedAt: now,
            decision,
            notes: reviewNote,
          },
        },
        $unset: decision === "rejected" ? { resolutionFeedback: "" } : {},
        $push: {
          statusHistory: {
            status: newStatus,
            changedBy: req.user.id,
            changedByModel: "Admin",
            note: `Supervisor review: ${decision}${reviewNote ? ` — ${reviewNote}` : ""}`,
            timestamp: now,
          },
        },
      },
    );

    // Notify citizen of outcome
    await createNotification({
      userId: complaint.user,
      title: decision === "approved" ? "Resolution Verified" : "Resolution Under Re-investigation",
      message:
        decision === "approved"
          ? `Your complaint "${complaint.title}" resolution has been approved by a supervisor.`
          : `The resolution for "${complaint.title}" has been rejected by a supervisor and is being re-investigated.`,
      type: "status_change",
      complaintId: complaint._id,
    });

    return res.json({
      success: true,
      message: `Resolution ${decision === "approved" ? "approved" : "rejected and complaint reopened"}.`,
      decision,
      newStatus,
    });
  } catch (err) {
    next(err);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/complaints/:id/resolution/public
// Public endpoint — no auth. Precise coords are stripped for privacy.
// ─────────────────────────────────────────────────────────────────────────────
exports.getPublicResolution = async (req, res, next) => {
  try {
    const complaint = await Complaint.findById(req.params.id).select(
      "title status resolvedAt resolutionEvidence location",
    );

    if (!complaint) {
      return res.status(404).json({ success: false, message: "Complaint not found." });
    }

    const ev = complaint.resolutionEvidence;
    if (!ev || !ev.submittedAt) {
      return res.status(404).json({
        success: false,
        message: "No resolution evidence has been submitted for this complaint.",
      });
    }

    // Build privacy-safe location text from complaint address (if any)
    const vicinity = complaint.location?.address || "Location on file";

    // Build supervisor review status string
    let integrityStatus = "VERIFIED";
    if (ev.isSuspicious) {
      const rev = ev.supervisorReview?.decision;
      integrityStatus = rev === "approved"
        ? "SUSPICIOUS_APPROVED"
        : rev === "rejected"
          ? "SUSPICIOUS_REJECTED"
          : "UNDER_REVIEW";
    }

    return res.json({
      success: true,
      complaintId: complaint._id,
      status: complaint.status,
      resolvedAt: ev.submittedAt,
      resolution: {
        imageUrl: ev.imageUrl,
        imageHash: ev.imageHash,
        distanceFromOriginM: ev.distanceFromOriginM,
        isSuspicious: ev.isSuspicious,
        suspicionReason: ev.suspicionReason,
        integrityStatus,
        // Privacy: return only origin coordinates for map (complaint site), NOT capture coords
        originCoordinates: complaint.location?.coordinates || null,
        vicinity,
        notes: ev.notes || null,
      },
    });
  } catch (err) {
    next(err);
  }
};
