/** MongoDB-backed OTP sessions shared by all application instances. */
const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "accountModel",
    },
    accountType: {
      type: String,
      enum: ["citizen", "admin"],
      required: true,
    },
    accountModel: {
      type: String,
      enum: ["User", "Admin"],
      required: true,
    },
    otpHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
  },
  { timestamps: true },
);

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", otpSchema);
