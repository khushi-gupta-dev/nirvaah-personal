/**
 * Auth Controller
 * Handles user registration, login, and profile retrieval
 */
const User = require("../models/User");
const Admin = require("../models/Admin");
const { validationResult } = require("express-validator");
const crypto = require("crypto");
const { sendOtpEmail } = require("../config/mailer");

// In-memory OTP storage (Map: sessionId -> { otp, userId, expiresAt, attempts })
const otpStore = new Map();

const generateOTP = () => crypto.randomInt(1000, 10000).toString(); // 4-digit OTP

// Clean up expired OTPs periodically
setInterval(() => {
  const now = new Date();
  for (const [sessionId, data] of otpStore.entries()) {
    if (data.expiresAt < now) {
      otpStore.delete(sessionId);
    }
  }
}, 60000); // Clean every minute

// Helper to send token response
const sendTokenResponse = (user, statusCode, res, message = "Success", accountType = "citizen") => {
  const token = user.generateJWT();

  res.status(statusCode).json({
    success: true,
    message,
    token,
    accountType,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: accountType, // Legacy UI transition
      avatar: user.avatar,
      points: user.points,
      complaintsCount: user.complaintsCount,
    },
  });
};

// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, role, wardNo, address, pincode } = req.body;

    // Prevent self-assigning admin role without a secret
    const reqAccountType =
      role === "admin" && req.body.adminSecret === process.env.ADMIN_SECRET
        ? "admin"
        : "citizen";

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    const existingAdmin = await Admin.findOne({ email });
    if (existingUser || existingAdmin) {
      return res
        .status(400)
        .json({ success: false, message: "Email already registered" });
    }

    let user;
    if (reqAccountType === "admin") {
      user = await Admin.create({
        name,
        email,
        password,
        wardNo: Number(wardNo),
        isActive: true,
      });
    } else {
      user = await User.create({ 
        name, email, password, 
        wardNo: wardNo || '', address: address || '', pincode: pincode || '', isVerified: true 
      });
    }

    sendTokenResponse(user, 201, res, "Account created successfully", reqAccountType);
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    let user = await Admin.findOne({ email }).select("+password");
    let accountType = "admin";

    if (!user) {
      user = await User.findOne({ email }).select("+password");
      accountType = "citizen";
    }

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    sendTokenResponse(user, 200, res, "Logged in successfully", accountType);
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/auth/send-otp
// @access  Public
exports.sendOtp = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    let user = await Admin.findOne({ email }).select("+password");
    let accountType = "admin";
    if (!user) {
      user = await User.findOne({ email }).select("+password");
      accountType = "citizen";
    }

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Generate OTP and session
    const code = generateOTP();
    const sessionId = `otp_${crypto.randomBytes(24).toString("hex")}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    const otpData = {
      otp: code,
      userId: user._id,
      accountType,
      expiresAt,
      attempts: 0,
    };

    try {
      await sendOtpEmail(email, code);
    } catch (error) {
      console.error("Sign-in code email could not be delivered:", error.message);
      return res.status(503).json({
        success: false,
        message: "Could not send the verification email. Please try again later.",
      });
    }

    otpStore.set(sessionId, otpData);

    res.status(200).json({ success: true, message: "OTP sent", sessionId });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/auth/verify-otp
// @access  Public
exports.verifyOtp = async (req, res, next) => {
  try {
    const { sessionId, otp } = req.body;
    if (!sessionId || !otp) {
      return res
        .status(400)
        .json({ success: false, message: "Session ID and OTP are required" });
    }

    const otpData = otpStore.get(sessionId);
    if (!otpData) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid or expired session" });
    }

    if (otpData.expiresAt < new Date()) {
      otpStore.delete(sessionId);
      return res
        .status(410)
        .json({ success: false, message: "OTP expired", expired: true });
    }

    if (otpData.attempts >= 5) {
      otpStore.delete(sessionId);
      return res.status(403).json({
        success: false,
        message: "Too many OTP attempts. Request a new code.",
      });
    }

    if (otpData.otp !== otp.trim()) {
      otpData.attempts += 1;
      return res.status(401).json({ success: false, message: "Invalid OTP" });
    }

    // OTP verified successfully
    otpStore.delete(sessionId);

    let user;
    if (otpData.accountType === "admin") {
      user = await Admin.findById(otpData.userId);
    } else {
      user = await User.findById(otpData.userId);
    }
    
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // Complete login
    sendTokenResponse(user, 200, res, "OTP verified, logged in successfully", otpData.accountType);
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/auth/resend-otp
// @access  Public
exports.resendOtp = async (req, res, next) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res
        .status(400)
        .json({ success: false, message: "Session ID required" });
    }

    const otpData = otpStore.get(sessionId);
    if (!otpData) {
      return res
        .status(404)
        .json({ success: false, message: "OTP session not found" });
    }

    // Send a replacement code before invalidating the currently stored code.
    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    let user;
    if (otpData.accountType === "admin") {
      user = await Admin.findById(otpData.userId);
    } else {
      user = await User.findById(otpData.userId);
    }
    if (!user) {
      otpStore.delete(sessionId);
      return res.status(404).json({ success: false, message: "User not found" });
    }

    try {
      await sendOtpEmail(user.email, code);
    } catch (error) {
      console.error("Replacement sign-in code email could not be delivered:", error.message);
      return res.status(503).json({
        success: false,
        message: "Could not resend the verification email. Please try again later.",
      });
    }

    otpData.otp = code;
    otpData.expiresAt = expiresAt;
    otpData.attempts = 0;

    res.status(200).json({ success: true, message: "OTP resent", sessionId });
  } catch (error) {
    next(error);
  }
};

// @route   GET /api/auth/me
// @access  Protected
exports.getMe = async (req, res, next) => {
  try {
    let user;
    if (req.accountType === "admin") {
      user = await Admin.findById(req.user.id);
    } else {
      user = await User.findById(req.user.id);
    }
    res.json({ success: true, user, accountType: req.accountType });
  } catch (error) {
    next(error);
  }
};

// @route   PUT /api/auth/profile
// @access  Protected
exports.updateProfile = async (req, res, next) => {
  try {
    const { name, avatar } = req.body;
    let user;
    if (req.accountType === "admin") {
      user = await Admin.findByIdAndUpdate(
        req.user.id,
        { name, avatar },
        { new: true, runValidators: true },
      );
    } else {
      user = await User.findByIdAndUpdate(
        req.user.id,
        { name, avatar },
        { new: true, runValidators: true },
      );
    }
    res.json({ success: true, user, accountType: req.accountType });
  } catch (error) {
    next(error);
  }
};

// @route   POST /api/auth/logout
// @access  Protected
// Note: JWT is stateless; client should delete token. Server-side blacklisting can be added.
exports.logout = async (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully.",
  });
};
