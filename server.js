/**
 * NIRVAAH Backend - Main Server Entry Point
 * Express.js + EJS + Socket.io
 */
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const passport = require("passport");
const path = require("path");
const i18n = require("i18n");
const cookieParser = require("cookie-parser");
const compression = require("compression");
require("dotenv").config();

const isProduction = process.env.NODE_ENV === "production";
const requiredStartupConfig = ["MONGO_URI", "JWT_SECRET"];
if (isProduction) {
    requiredStartupConfig.push(
        "ADMIN_SECRET",
        "CLOUDINARY_CLOUD_NAME",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
        "SMTP_USER",
        "SMTP_PASS",
    );
}

const missingStartupConfig = requiredStartupConfig.filter(
    (key) => !process.env[key]?.trim(),
);
const jwtSecret = process.env.JWT_SECRET?.trim();
if (isProduction && jwtSecret && jwtSecret.length < 32) {
    missingStartupConfig.push("JWT_SECRET (at least 32 characters)");
}
if (missingStartupConfig.length) {
    throw new Error(`Missing or invalid required environment variables: ${missingStartupConfig.join(", ")}`);
}
const mongoose = require("mongoose");

const corsOrigins = (process.env.CLIENT_URL || "")
    .split(",")
    .map((value) => {
        try {
            return new URL(value.trim()).origin;
        } catch {
            return null;
        }
    })
    .filter(Boolean);
if (process.env.NODE_ENV !== "production") {
    const localPort = process.env.PORT || 5000;
    corsOrigins.push(`http://localhost:${localPort}`, `http://127.0.0.1:${localPort}`);
}
const corsOrigin = (origin, callback) => {
    callback(null, !origin || corsOrigins.includes(origin));
};

// Route files
const authRoutes = require("./routes/auth");
const complaintRoutes = require("./routes/complaints");
const adminRoutes = require("./routes/admin");
const adminPriorityRoutes = require("./routes/adminPriority");
const notificationRoutes = require("./routes/notifications");
const userRoutes = require("./routes/users");
const viewRoutes = require("./routes/views"); // EJS page routes
const langRoutes = require("./routes/lang");

// Middleware
const errorHandler = require("./middleware/errorHandler");

const app = express();
const server = http.createServer(app);

// Socket.io
const io = new Server(server, {
    cors: { origin: corsOrigin, methods: ["GET", "POST"] },
});
global.io = io;
io.on("connection", (socket) => {
    socket.on("join", (userId) => socket.join(userId));
});

// ====================
// EJS TEMPLATE ENGINE
// ====================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ====================
// i18n CONFIGURATION
// ====================
i18n.configure({
    locales: ["en", "hi"],
    directory: path.join(__dirname, "locales"),
    defaultLocale: "en",
    cookie: "lang",
    queryParameter: "lang",
    autoReload: true,
    updateFiles: false,
    api: {
        __: "__", //now req.__ becomes available in views
        __n: "__n",
    },
});

// ====================
// STATIC FILES
// ====================
// Serve CSS, JS, PWA assets from public/
app.use(express.static(path.join(__dirname, "public")));

// ====================
// MIDDLEWARE
// ====================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan("dev"));
app.use(cors({ origin: corsOrigin, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(i18n.init); // Initialize i18n after building cookies

// Passport
require("./config/passport")(passport);
app.use(passport.initialize());

// ====================
// DATABASE
// ====================
const connectDB = require("./config/db");

// Independent priority-module scheduler (non-breaking)
const adminPriorityModuleScheduler = require("./services/adminPriorityModuleScheduler");

// ====================
// API ROUTES
// ====================
app.use("/api/auth", authRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/admin-priority", adminPriorityRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/chatbot", require("./routes/chatbot"));

app.get("/api/health", (req, res) => {
    const databaseReady = mongoose.connection.readyState === 1;
    res.status(databaseReady ? 200 : 503).json({
        status: databaseReady ? "OK" : "NOT_READY",
        message: databaseReady ? "NIRVAAH API is ready" : "Database is not connected",
        timestamp: new Date(),
    });
});

// ====================
// EJS PAGE ROUTES
// ====================
app.use("/lang", langRoutes);
app.use("/", viewRoutes);

// ====================
// ERROR HANDLER
// ====================
app.use(errorHandler);

// ====================
// START
// ====================
const PORT = process.env.PORT || 5000;
const startServer = async () => {
    await connectDB();
    adminPriorityModuleScheduler.start();

    server.listen(PORT, "0.0.0.0", () => {
        console.log(`NIRVAAH listening on port ${PORT}`);
        console.log(`Mode: ${process.env.NODE_ENV || "development"}`);
    });
};

startServer().catch((error) => {
    console.error("Server startup failed:", error.message);
    process.exit(1);
});

process.on("unhandledRejection", (err) => {
    console.error("Unhandled Rejection:", err.message);
    server.close(() => process.exit(1));
});

module.exports = { app, server, io };
