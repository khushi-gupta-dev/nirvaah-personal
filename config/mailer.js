/**
 * Nodemailer transport used for login OTP emails.
 *
 * Gmail is the default provider. Set SMTP_HOST to use another SMTP service.
 * For Gmail, SMTP_PASS must be an App Password (not the account password).
 */
const nodemailer = require("nodemailer");

let transporter;

const getTransporter = () => {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error("OTP email is not configured. Set SMTP_USER and SMTP_PASS.");
  }

  if (!transporter) {
    const auth = { user, pass };
    const smtpHost = process.env.SMTP_HOST;

    if (smtpHost) {
      const port = Number(process.env.SMTP_PORT || 587);
      transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: process.env.SMTP_SECURE
          ? process.env.SMTP_SECURE === "true"
          : port === 465,
        auth,
      });
    } else {
      transporter = nodemailer.createTransport({ service: "gmail", auth });
    }
  }

  return transporter;
};

exports.sendOtpEmail = async (to, otp) => {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  return getTransporter().sendMail({
    from: `NIRVAAH <${from}>`,
    to,
    subject: "NIRVAAH login verification code",
    text: `Your NIRVAAH login code is ${otp}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
  });
};
