# NIRVAAH — Civic Issue Reporting System

NIRVAAH is a Node.js/Express civic reporting application for citizens and municipal administrators. Citizens can report local issues with photos and GPS coordinates, browse complaints on maps, vote on issues, track their own reports, submit feedback after resolution, receive notifications, and use a simple rule-based chatbot. Administrators can manage complaint status, view analytics, operate a priority workflow, and publish transparent resolution evidence.

## What is in this codebase

- **Express API and EJS web app** served from a single Node.js process.
- **MongoDB persistence** through Mongoose models for citizens, admins, complaints, notifications, OTPs, and priority workflows.
- **JWT authentication** with Passport JWT guards for protected API routes.
- **Cloudinary image uploads** for complaint photos and resolution evidence.
- **Socket.IO notifications** emitted to user-specific rooms when notifications are created.
- **Internationalization** for English and Hindi through `i18n`, locale JSON files, and language routes.
- **PWA assets** including a manifest, install prompt helpers, offline page, and service workers.

## Core Features

### Citizen functionality

- Register and log in as a citizen.
- Log in with email OTP after password verification; OTPs are stored in memory and expire after five minutes.
- Create complaints with title, description, category, location, address/landmark, and up to five images.
- Receive a rule-based category suggestion from complaint text and uploaded image filename.
- Automatic duplicate detection for active complaints in the same category within 100 meters.
- Browse public complaints, map markers, issue detail pages, and nearby issues.
- Track personal complaints and status history.
- Upvote or remove an upvote from complaints.
- Submit feedback for resolved complaints.
- View notifications, leaderboard, and profile pages.
- Use the rule-based chatbot powered by `chatbotData.json`.

### Admin functionality

- Register an admin account when the correct `ADMIN_SECRET` is supplied.
- Log in through the same auth API as citizens; admin accounts are checked before citizen accounts.
- List and filter complaints, update complaint status, and add admin notes.
- View analytics for statuses, categories, trends, top users, upvotes, and resolution timing.
- Use the priority dashboard to track derived priority, deadlines, overdue status, and workflow state.
- Trigger priority escalation and deadline-alert jobs manually through admin APIs.
- Submit Transparent Resolution System evidence from a mobile user agent with GPS and a photo.
- Review suspicious resolution submissions and either approve them or reopen the complaint.

### Transparent Resolution System (TRS)

TRS is implemented on complaint resolution routes. Resolution evidence is admin-only, mobile-only, and stored separately in Cloudinary. The server records its own timestamp, validates capture coordinates, checks distance from the original complaint with the Haversine formula, flags suspicious submissions, stores a deterministic evidence hash, and prevents evidence from being overwritten after first submission.

## Tech Stack

- **Runtime:** Node.js
- **Server:** Express.js, HTTP server, Socket.IO
- **Views:** EJS templates
- **Database:** MongoDB with Mongoose
- **Authentication:** JSON Web Tokens, Passport JWT, bcryptjs
- **Uploads:** Multer, multer-storage-cloudinary, Cloudinary
- **Validation and middleware:** express-validator, Helmet, CORS, compression, Morgan, cookie-parser
- **Email:** Nodemailer
- **i18n:** i18n with English and Hindi locale files
- **PWA:** Web app manifest, service workers, offline fallback page, IndexedDB helper

## Project Structure

```text
.
├── config/                 # Database, Passport, Cloudinary, mailer, and seed setup
├── controllers/            # Request handlers for auth, complaints, admin, TRS, notifications, users, chatbot
├── middleware/             # JWT protection, admin guards, upload handlers, error handling
├── models/                 # Mongoose schemas
├── routes/                 # API routes and EJS page routes
├── services/               # Priority workflow, deadline, and escalation services
├── utils/                  # Shared utilities such as Haversine distance helpers
├── views/                  # EJS pages and partials for citizen/admin UI
├── public/                 # CSS, browser JS, service workers, PWA manifest, offline page
├── locales/                # Translation files: en.json and hi.json
├── chatbotData.json        # Rule-based chatbot content
├── add_translations.js     # Translation helper script
├── server.js               # Application entry point
├── package.json            # Scripts and dependencies
└── package-lock.json
```

## Prerequisites

- Node.js 18 or newer
- npm
- MongoDB database
- Cloudinary account and API credentials
- SMTP credentials for OTP email delivery (a Gmail account with an App Password works for low-volume use)

## Environment Variables

Create a `.env` file in the repository root.

```env
# Application
NODE_ENV=development
PORT=5000
CLIENT_URL=http://localhost:3000

# Database
MONGO_URI=mongodb://127.0.0.1:27017/nirvaah

# Authentication
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRE=7d
ADMIN_SECRET=replace_with_admin_registration_secret

# Cloudinary uploads
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# OTP email delivery
SMTP_USER=your_gmail_address@gmail.com
SMTP_PASS=your_16_character_google_app_password
SMTP_FROM=your_gmail_address@gmail.com

# Optional: use these only for a non-Gmail SMTP provider
SMTP_HOST=smtp.your-provider.example
SMTP_PORT=587
SMTP_SECURE=false

# Transparent Resolution System tuning
TRS_DISTANCE_THRESHOLD_M=100
TRS_GPS_ACCURACY_MAX_M=150
```

For Gmail, leave `SMTP_HOST` unset. Create a Google App Password after enabling 2-Step Verification, then set `SMTP_USER` and `SMTP_PASS` in your local `.env` and in your deployment provider's environment settings. Do not commit these credentials. If the SMTP credentials are missing or email delivery fails, OTP endpoints return an error; the application does not print OTP codes to the server console.

Set `CLIENT_URL` to the deployed website's origin for production CORS. Multiple origins can be comma-separated. The server-rendered site itself is same-origin and does not require CORS.

## Installation

```bash
git clone <repository-url>
cd NIRVAAH-Civic-issue-reporting-system
npm install
```

## Running the Application

```bash
# Development with nodemon
npm run dev

# Production-style start
npm start
```

By default, the app runs at:

- Web app: `http://localhost:5000`
- Health check: `GET http://localhost:5000/api/health`

## Optional Database Seed

```bash
npm run seed
```

The seed script connects to MongoDB, clears existing users/admins/complaints, creates sample citizens and admins, and inserts sample complaints.

## API Overview

### Authentication: `/api/auth`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/register` | Public | Create citizen account, or admin account with `ADMIN_SECRET` |
| `POST` | `/login` | Public | Password login for admin or citizen |
| `POST` | `/send-otp` | Public | Verify password and send/create OTP session |
| `POST` | `/verify-otp` | Public | Exchange valid OTP session for JWT |
| `POST` | `/resend-otp` | Public | Generate a fresh OTP for an existing session |
| `GET` | `/me` | JWT | Return current user/admin profile |
| `POST` | `/logout` | JWT | Client-side logout confirmation endpoint |
| `PUT` | `/profile` | JWT | Update profile fields |

### Complaints: `/api/complaints`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/` | Public | List complaints with filters and pagination |
| `POST` | `/` | JWT | Create complaint with up to five `images` files |
| `GET` | `/map` | Public | Return lightweight complaint markers |
| `GET` | `/my` | JWT | List current user's complaints |
| `GET` | `/:id` | Public | Fetch one complaint |
| `POST` | `/:id/vote` | JWT | Toggle current user's vote |
| `DELETE` | `/:id` | JWT | Delete complaint as owner or admin |
| `GET` | `/:id/feedback` | JWT | Read current user's feedback for complaint |
| `POST` | `/:id/feedback` | JWT | Submit/update feedback for a resolved complaint |
| `GET` | `/:id/resolution/public` | Public | Read public resolution evidence summary |
| `POST` | `/:id/resolution` | Admin JWT | Submit mobile GPS/photo resolution evidence |
| `PATCH` | `/:id/resolution/review` | Admin JWT | Review suspicious resolution evidence |

### Admin: `/api/admin`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/complaints` | Admin JWT | List complaints for admin management |
| `PATCH` | `/complaints/:id/status` | Admin JWT | Update status/admin note |
| `GET` | `/analytics` | Admin JWT | Return dashboard analytics |
| `GET` | `/users` | Admin JWT | List citizens |

### Priority module: `/api/admin-priority`

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/dashboard` | Admin JWT | List workflow cards with priority and countdown metadata |
| `PATCH` | `/:complaintId/status` | Admin JWT | Transition priority workflow status |
| `POST` | `/jobs/escalation` | Admin JWT | Run escalation job immediately |
| `POST` | `/jobs/deadline-alerts` | Admin JWT | Run deadline alert job immediately |

### Other APIs

| Base path | Routes |
| --- | --- |
| `/api/notifications` | `GET /`, `PATCH /read-all`, `PATCH /:id/read` |
| `/api/users` | `GET /leaderboard`, `GET /profile/:id` |
| `/api/chatbot` | `GET /data`, `POST /message` |
| `/lang` | `GET /dict/:locale`, `POST /set`, `GET /:locale` |
| `/api/health` | `GET` |

## Web Pages

### Public pages

- `/`
- `/login`
- `/otp`
- `/register`
- `/map`
- `/leaderboard`
- `/terms`

### Citizen pages

- `/dashboard`
- `/report`
- `/my-complaints`
- `/complaint`
- `/notifications`
- `/profile`
- `/nearby`
- `/issue`

### Admin pages

- `/admin` redirects to `/admin/login`
- `/admin/login`
- `/admin/register`
- `/admin/dashboard`
- `/admin/complaints`
- `/admin/complaint`
- `/admin/analytics`
- `/admin/priority-dashboard`
- `/admin/map`
- `/admin/leaderboard`

## Important Workflows and Rules

### Complaint creation

1. A JWT-authenticated citizen submits complaint metadata, coordinates, and one to five images.
2. The server requires coordinates and at least one uploaded image.
3. Images are uploaded to Cloudinary under `nirvaah/complaints`.
4. A rule-based category suggestion is stored as `aiSuggestedCategory`.
5. Active same-category complaints within 100 meters are treated as potential duplicates.
6. The reporter receives points, and priority/deadline information is updated.

### Status and resolution

- New complaints start as `pending`.
- Admins can update status to `pending`, `in_progress`, or `resolved` through admin APIs.
- TRS resolution submission also sets the complaint to `resolved`, stores evidence, records a status history entry, awards resolution points, and notifies the complaint owner.
- Suspicious TRS evidence can be approved or rejected by an admin; rejected evidence reopens the complaint as `in_progress`.

### Priority workflow

- Priority is derived primarily from vote count.
- Deadlines are derived from priority.
- A background scheduler starts with the app and periodically runs escalation and deadline-alert checks.
- Admins can also trigger these jobs manually through API routes.

### Notifications

Notifications are stored in MongoDB and emitted over Socket.IO when `global.io` is available. Clients join a room named after their user ID.

## PWA and Offline Support

The project includes PWA files under `public/pwa/`, a root service worker under `public/sw.js`, an offline fallback page, browser API helpers, IndexedDB support, and an install-prompt partial used by EJS pages.

## Available npm Scripts

```bash
npm start      # Start server with node server.js
npm run dev    # Start server with nodemon
npm run seed   # Seed MongoDB with sample data
```

## Development Notes

- EJS page routes do not apply server-side page auth; templates and browser scripts are expected to enforce UI behavior while APIs enforce JWT/admin protection.
- `helmet` is configured with Content Security Policy disabled to keep the existing EJS/static asset flow working.
- CORS is currently open to all origins.
- OTP data is stored in an in-memory `Map`, so OTP sessions disappear when the server restarts.
- The priority scheduler is in-process; multi-instance deployments need an external scheduler or distributed locking.
- No license file is currently included.
