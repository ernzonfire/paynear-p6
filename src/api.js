const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
// Render may need a little longer to wake the API after an idle period.
// Keep the request cancellable from the UI, but do not surface a false error
// while the production service is still completing a healthy cold start.
const REQUEST_TIMEOUT_MS = 45000;

export const socketOrigin = API_URL.replace(/\/api\/?$/, "");

export async function request(path, options = {}, token = "") {
  const headers = { ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort("timeout"), REQUEST_TIMEOUT_MS);
  const cancelFromCaller = () => controller.abort("cancelled");
  options.signal?.addEventListener("abort", cancelFromCaller, { once: true });

  try {
    const response = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed. Please try again.");
    return data;
  } catch (error) {
    if (options.signal?.aborted) {
      const cancelled = new Error("Request cancelled.");
      cancelled.name = "AbortError";
      throw cancelled;
    }
    if (controller.signal.aborted) throw new Error("PayNear is taking too long to respond. Please try again.");
    if (error instanceof TypeError) throw new Error("Could not reach PayNear. Check your connection and try again.");
    throw error;
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancelFromCaller);
  }
}

export const api = {
  listEstablishments(filters, options = {}) {
    const query = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "" && value !== false && value !== 0));
    return request(`/establishments?${query}`, options);
  },
  getEstablishment(id) { return request(`/establishments/${id}`); },
  reviews(id) { return request(`/establishments/${id}/reviews`); },
  myReview(id, token) { return request(`/establishments/${id}/reviews/me`, {}, token); },
  saveReview(id, payload, token) { return request(`/establishments/${id}/reviews/me`, { method: "PUT", body: JSON.stringify(payload) }, token); },
  deleteReview(id, token) { return request(`/establishments/${id}/reviews/me`, { method: "DELETE" }, token); },
  register(payload) { return request("/auth/register", { method: "POST", body: JSON.stringify(payload) }); },
  login(payload) { return request("/auth/login", { method: "POST", body: JSON.stringify(payload) }); },
  me(token) { return request("/auth/me", {}, token); },
  changePassword(newPassword, token) { return request("/auth/change-password", { method: "POST", body: JSON.stringify({ newPassword }) }, token); },
  preferences(preferredPaymentMethod, token) { return request("/account/preferences", { method: "PUT", body: JSON.stringify({ preferredPaymentMethod }) }, token); },
  favorite(id, token) { return request(`/account/favorites/${id}`, { method: "POST" }, token); },
  favorites(token) { return request("/account/favorites", {}, token); },
  deleteAccount(password, token) { return request("/account", { method: "DELETE", body: JSON.stringify({ password }) }, token); },
  aiSuggest(prompt) { return request("/ai/suggest", { method: "POST", body: JSON.stringify({ prompt }) }); },
  conversations(token) { return request("/conversations", {}, token); },
  messages(id, token, conversationUserId = "") { return request(`/messages/${id}${conversationUserId ? `?conversationUserId=${encodeURIComponent(conversationUserId)}` : ""}`, {}, token); },
  notifications(token) { return request("/notifications", {}, token); },
  readNotification(id, token) { return request(`/notifications/${id}/read`, { method: "PATCH" }, token); },
  ownerListings(token) { return request("/owner/establishments", {}, token); },
  adminListings(token, status = "") { return request(`/admin/establishments${status ? `?status=${encodeURIComponent(status)}` : ""}`, {}, token); },
  createListing(payload, token) { return request("/establishments", { method: "POST", body: JSON.stringify(payload) }, token); },
  updateListing(id, payload, token) { return request(`/establishments/${id}`, { method: "PUT", body: JSON.stringify(payload) }, token); },
  reviewListing(id, payload, token) { return request(`/admin/establishments/${id}/review`, { method: "PATCH", body: JSON.stringify(payload) }, token); },
  uploadImage(id, file, token) {
    const form = new FormData();
    form.append("image", file);
    return request(`/establishments/${id}/image`, { method: "POST", body: form }, token);
  },
};
