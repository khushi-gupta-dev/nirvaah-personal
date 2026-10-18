/**
 * Auth Controller
 * Handles user registration, login, and profile retrieval
 */
const User = require("../models/User");
const Admin = require("../models/Admin");
const { validationResult } = require("express-validator");

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
