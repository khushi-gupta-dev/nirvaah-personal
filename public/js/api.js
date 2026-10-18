/**
 * NIRVAAH Frontend - API Service
 * Centralized API calls with JWT token management
 */

const API_BASE = (() => {
  const configured = (window.API_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return `${window.location.origin}/api`;
})();
// ============================================================
// TOKEN MANAGEMENT
// ============================================================
const getToken = () => localStorage.getItem("nirvaah_token");
const setToken = (token) => localStorage.setItem("nirvaah_token", token);
const removeToken = () => localStorage.removeItem("nirvaah_token");

const getUser = () => {
  const u = localStorage.getItem("nirvaah_user");
  return u ? JSON.parse(u) : null;
};
const setUser = (user) =>
  localStorage.setItem("nirvaah_user", JSON.stringify(user));
const removeUser = () => localStorage.removeItem("nirvaah_user");

// ============================================================
// FETCH WRAPPER
// ============================================================
const apiFetch = async (endpoint, options = {}) => {
  const token = getToken();
  const headers = {
    ...(options.headers || {}),
  };

  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    const baseUrl = endpoint.split('?')[0];
    const isLoginEndpoint = ["/auth/login", "/auth/register"].includes(baseUrl);
    if (response.status === 401 && !isLoginEndpoint) {
      removeToken();
      removeUser();
      window.location.href = "/login?expired=true";
      return;
    }
    const error = new Error(data.message || "Request failed");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

// ============================================================
// AUTH API
// ============================================================
const Auth = {
  async register(name, email, password, role = "citizen", adminSecret = "", wardNo = "", address = "", pincode = "") {
    const data = await apiFetch("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password, role, adminSecret, wardNo, address, pincode }),
    });
    setToken(data.token);
    if (data.accountType && data.user) data.user.accountType = data.accountType;
    setUser(data.user);
    return data;
  },

  async login(email, password) {
    const data = await apiFetch("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setToken(data.token);
    if (data.accountType && data.user) data.user.accountType = data.accountType;
    setUser(data.user);
    return data;
  },

  logout() {
    removeToken();
    removeUser();
    window.location.href = "/login";
  },

  async getMe() {
    return apiFetch("/auth/me");
  },

  async updateProfile(data) {
    return apiFetch("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  isLoggedIn() {
    return !!getToken();
  },

  isAdmin() {
    const user = getUser();
    return user && (user.accountType === "admin" || user.role === "admin");
  },
};

// ============================================================
// COMPLAINTS API
// ============================================================
const Complaints = {
  async getAll(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/complaints?${qs}`);
  },

  async getForMap() {
    return apiFetch("/complaints/map");
  },

  async getMy(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/complaints/my?${qs}`);
  },

  async getById(id) {
    return apiFetch(`/complaints/${id}`);
  },

  async create(formData) {
    return apiFetch("/complaints", {
      method: "POST",
      body: formData, // FormData with images
    });
  },

  async vote(id) {
    return apiFetch(`/complaints/${id}/vote`, { method: "POST" });
  },

  async delete(id) {
    return apiFetch(`/complaints/${id}`, { method: "DELETE" });
  },

  async getFeedback(id) {
    return apiFetch(`/complaints/${id}/feedback`);
  },

  async submitFeedback(id, payload) {
    return apiFetch(`/complaints/${id}/feedback`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

// ============================================================
// ADMIN API
// ============================================================
const Admin = {
  async getComplaints(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin/complaints?${qs}`);
  },

  async updateStatus(id, status, note = "") {
    return apiFetch(`/admin/complaints/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    });
  },

  async getAnalytics() {
    return apiFetch("/admin/analytics");
  },

  async getUsers() {
    return apiFetch("/admin/users");
  },

  async getPriorityDashboard(filters = {}) {
    const qs = new URLSearchParams(filters).toString();
    return apiFetch(`/admin/priority-dashboard?${qs}`);
  },
};

// ============================================================
// ADMIN PRIORITY MODULE API (INDEPENDENT)
// ============================================================
const AdminPriority = {
  async getDashboard(params = {}) {
    const qs = new URLSearchParams(params).toString();
    return apiFetch(`/admin-priority/dashboard?${qs}`);
  },

  async updateStatus(complaintId, status, note = "") {
    return apiFetch(`/admin-priority/${complaintId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, note }),
    });
  },

  async runEscalation() {
    return apiFetch("/admin-priority/jobs/escalation", {
      method: "POST",
    });
  },

  async runDeadlineAlerts() {
    return apiFetch("/admin-priority/jobs/deadline-alerts", {
      method: "POST",
    });
  },
};

// ============================================================
// NOTIFICATIONS API
// ============================================================
const Notifications = {
  async getAll() {
    return apiFetch("/notifications");
  },

  async markRead(id) {
    return apiFetch(`/notifications/${id}/read`, { method: "PATCH" });
  },

  async markAllRead() {
    return apiFetch("/notifications/read-all", { method: "PATCH" });
  },
};

// ============================================================
// USERS API
// ============================================================
const Users = {
  async getLeaderboard() {
    return apiFetch("/users/leaderboard");
  },

  async getProfile(id) {
    return apiFetch(`/users/profile/${id}`);
  },
};

// Export for use across pages
window.NIRVAAH = {
  getToken,
  setToken,
  removeToken,
  getUser,
  setUser,
  removeUser,
  Auth,
  Complaints,
  Admin,
  AdminPriority,
  Notifications,
  Users,
};
