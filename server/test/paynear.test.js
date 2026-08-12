import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import http from "node:http";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createEstablishment, createMessage, createUser, getMessages, listEstablishments } from "../src/demoStore.js";
import { suggestFilters } from "../src/services/aiService.js";

test("advanced filtering returns only matching open GCash places", async () => {
  const results = await listEstablishments({ method: "GCash", openNow: true, radiusKm: 2, minRating: 4.5 });
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.openNow));
  assert.ok(results.every((item) => item.acceptedPaymentMethods.includes("GCash")));
  assert.ok(results.every((item) => item.distanceKm <= 2));
});

test("QR Ph and InstaPay are accepted payment filters", async () => {
  const qrPhResults = await listEstablishments({ method: "QR Ph", radiusKm: 3 });
  const instaPayResults = await listEstablishments({ method: "InstaPay", radiusKm: 3 });

  assert.ok(qrPhResults.length > 0);
  assert.ok(qrPhResults.every((item) => item.acceptedPaymentMethods.includes("QR Ph")));
  assert.ok(instaPayResults.length > 0);
  assert.ok(instaPayResults.every((item) => item.acceptedPaymentMethods.includes("InstaPay")));
});

test("nearby filtering uses coordinates and the selected radius", async () => {
  const results = await listEstablishments({ latitude: 14.6351, longitude: 121.0342, radiusKm: 1, method: "GCash" });
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.distanceKm <= 1));
  assert.equal(results[0].name, "Brew & Go Cafe");
  assert.equal(results[0].ownerName, "Ariana Santos");
});

test("sample listings support nearby searches in Lapu-Lapu, Mawaque, and Baguio", async () => {
  const lapuLapuResults = await listEstablishments({ latitude: 10.295, longitude: 124.0005, radiusKm: 3 });
  const mawaqueResults = await listEstablishments({ latitude: 15.2055, longitude: 120.5913, radiusKm: 1 });
  const baguioResults = await listEstablishments({ latitude: 16.41, longitude: 120.596, radiusKm: 3 });

  assert.ok(lapuLapuResults.some((item) => item.name === "Maribago Daily Mart"));
  assert.ok(lapuLapuResults.every((item) => item.distanceKm <= 3));
  assert.ok(mawaqueResults.some((item) => item.name === "Mawaque PayHub Mart"));
  assert.ok(mawaqueResults.every((item) => item.distanceKm <= 1));
  assert.ok(baguioResults.some((item) => item.name === "Session Brew House"));
  assert.ok(baguioResults.every((item) => item.distanceKm <= 3));
});

test("local AI assistant suggests safe directory filters without an API key", async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  const previousModel = process.env.OPENAI_MODEL;
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_MODEL;

  const result = await suggestFilters("coffee shop with GCash near me, open now");
  assert.equal(result.provider, "local-fallback");
  assert.equal(result.filters.method, "GCash");
  assert.equal(result.filters.openNow, true);
  assert.equal(result.filters.radiusKm, 3);

  if (previousKey) process.env.OPENAI_API_KEY = previousKey;
  if (previousModel) process.env.OPENAI_MODEL = previousModel;
});

test("manually created user, owner, and provisioned administrator accounts sign in with the correct roles", async (context) => {
  const { app } = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const login = async (email, password) => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return { response, body: await response.json() };
  };

  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const accounts = [
    { name: "Manual User", email: `manual-user-${suffix}@paynear.test`, password: "manualuser123", role: "user" },
    { name: "Manual Owner", email: `manual-owner-${suffix}@paynear.test`, password: "manualowner123", role: "owner" },
  ];

  for (const account of accounts) {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(account),
    });
    assert.equal(response.status, 201);
  }

  const admin = { name: "Provisioned Admin", email: `provisioned-admin-${suffix}@paynear.test`, password: "adminsecure123", role: "admin" };
  await createUser({ name: admin.name, email: admin.email, passwordHash: await bcrypt.hash(admin.password, 10), role: admin.role });
  accounts.push(admin);

  for (const account of accounts) {
    const result = await login(account.email, account.password);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.user.role, account.role);
    assert.ok(result.body.token);
  }

  const wrongPassword = await login(admin.email, "incorrect-password");
  assert.equal(wrongPassword.response.status, 401);
});

test("a provisioned admin must replace the temporary password before accessing protected features", async (context) => {
  const { app } = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    return { response, body: await response.json() };
  };
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `first-login-admin-${suffix}@paynear.test`;
  const temporaryPassword = "PayNear-Temporary-123";
  const newPassword = "PayNear-Private-Password-456";
  await createUser({
    name: "First Login Admin",
    email,
    passwordHash: await bcrypt.hash(temporaryPassword, 10),
    role: "admin",
    mustChangePassword: true,
    sessionVersion: 0,
  });

  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: temporaryPassword }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.user.mustChangePassword, true);

  const blockedAdminQueue = await request("/admin/establishments", {
    headers: { Authorization: `Bearer ${login.body.token}` },
  });
  assert.equal(blockedAdminQueue.response.status, 403);
  assert.equal(blockedAdminQueue.body.code, "PASSWORD_CHANGE_REQUIRED");

  const reusedTemporaryPassword = await request("/auth/change-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ newPassword: temporaryPassword }),
  });
  assert.equal(reusedTemporaryPassword.response.status, 400);

  const changed = await request("/auth/change-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${login.body.token}` },
    body: JSON.stringify({ newPassword }),
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.user.mustChangePassword, false);
  assert.notEqual(changed.body.token, login.body.token);

  const oldSession = await request("/auth/me", {
    headers: { Authorization: `Bearer ${login.body.token}` },
  });
  assert.equal(oldSession.response.status, 401);

  const adminQueue = await request("/admin/establishments", {
    headers: { Authorization: `Bearer ${changed.body.token}` },
  });
  assert.equal(adminQueue.response.status, 200);

  const oldPasswordLogin = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: temporaryPassword }),
  });
  assert.equal(oldPasswordLogin.response.status, 401);

  const newPasswordLogin = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: newPassword }),
  });
  assert.equal(newPasswordLogin.response.status, 200);
  assert.equal(newPasswordLogin.body.user.mustChangePassword, false);
});

test("public registration cannot create administrators and requires stronger passwords", async (context) => {
  const { app } = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const adminAttempt = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Public Admin Attempt", email: `admin-attempt-${suffix}@paynear.test`, password: "securepass123", role: "admin" }),
  });
  const adminAttemptBody = await adminAttempt.json();
  assert.equal(adminAttempt.status, 201);
  assert.equal(adminAttemptBody.user.role, "user");

  const weakPassword = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Weak Password", email: `weak-${suffix}@paynear.test`, password: "short", role: "owner" }),
  });
  assert.equal(weakPassword.status, 400);
});

test("owner submissions stay private until an administrator verifies and publishes them", async (context) => {
  const { app } = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, options = {}) => {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
    });
    const contentType = response.headers.get("content-type") || "";
    return { response, body: contentType.includes("application/json") ? await response.json() : await response.arrayBuffer() };
  };
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  const ownerRegistration = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Owner One", email: `owner-one-${suffix}@paynear.test`, password: "testing123", role: "owner" }),
  });
  assert.equal(ownerRegistration.response.status, 201);
  assert.equal(ownerRegistration.body.user.role, "owner");

  const listing = await request("/establishments", {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerRegistration.body.token}` },
    body: JSON.stringify({
      name: "Owner One Store",
      category: "Cafe",
      address: "Maribago, Lapu-Lapu City",
      latitude: 10.2993,
      longitude: 123.9953,
      acceptedPaymentMethods: ["GCash", "QR Ph"],
      openNow: true,
    }),
  });
  assert.equal(listing.response.status, 201);
  assert.equal(listing.body.establishment.ownerName, "Owner One");
  assert.equal(listing.body.establishment.verificationStatus, "pending");
  assert.equal(listing.body.establishment.isActive, false);

  const publicBeforeReview = await request(`/establishments?query=${encodeURIComponent("Owner One Store")}`);
  assert.equal(publicBeforeReview.response.status, 200);
  assert.equal(publicBeforeReview.body.establishments.length, 0);

  const ownerListings = await request("/owner/establishments", { headers: { Authorization: `Bearer ${ownerRegistration.body.token}` } });
  assert.equal(ownerListings.response.status, 200);
  assert.ok(ownerListings.body.establishments.some((item) => item._id === listing.body.establishment._id));

  const ownerAdminQueue = await request("/admin/establishments", { headers: { Authorization: `Bearer ${ownerRegistration.body.token}` } });
  assert.equal(ownerAdminQueue.response.status, 403);

  const anotherOwner = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Owner Two", email: `owner-two-${suffix}@paynear.test`, password: "testing123", role: "owner" }),
  });
  const forbiddenUpdate = await request(`/establishments/${listing.body.establishment._id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${anotherOwner.body.token}` },
    body: JSON.stringify({ openNow: false }),
  });
  assert.equal(forbiddenUpdate.response.status, 403);

  const adminEmail = `workflow-admin-${suffix}@paynear.test`;
  const adminPassword = "workflowadmin123";
  await createUser({ name: "Workflow Admin", email: adminEmail, passwordHash: await bcrypt.hash(adminPassword, 10), role: "admin" });
  const adminLogin = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  assert.equal(adminLogin.response.status, 200);
  assert.equal(adminLogin.body.user.role, "admin");

  const adminQueue = await request("/admin/establishments?status=pending", { headers: { Authorization: `Bearer ${adminLogin.body.token}` } });
  assert.equal(adminQueue.response.status, 200);
  assert.ok(adminQueue.body.establishments.some((item) => item._id === listing.body.establishment._id));

  const verifyWithoutImage = await request(`/admin/establishments/${listing.body.establishment._id}/review`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminLogin.body.token}` },
    body: JSON.stringify({ action: "verify" }),
  });
  assert.equal(verifyWithoutImage.response.status, 400);

  const imageForm = new FormData();
  imageForm.append("image", new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "store.png");
  const imageUpload = await request(`/establishments/${listing.body.establishment._id}/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerRegistration.body.token}` },
    body: imageForm,
  });
  assert.equal(imageUpload.response.status, 200);
  assert.match(imageUpload.body.establishment.imageUrl, new RegExp(`/api/establishments/${listing.body.establishment._id}/image`));

  const verify = await request(`/admin/establishments/${listing.body.establishment._id}/review`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${adminLogin.body.token}` },
    body: JSON.stringify({ action: "verify", reviewNotes: "Store details and storefront image confirmed." }),
  });
  assert.equal(verify.response.status, 200);
  assert.equal(verify.body.establishment.verificationStatus, "verified");
  assert.equal(verify.body.establishment.isActive, true);

  const publicAfterReview = await request(`/establishments?query=${encodeURIComponent("Owner One Store")}`);
  assert.equal(publicAfterReview.response.status, 200);
  assert.equal(publicAfterReview.body.establishments.length, 1);
  assert.equal(publicAfterReview.body.establishments[0].ownerUserId, undefined);
  assert.equal(publicAfterReview.body.establishments[0].reviewNotes, undefined);

  const publicImage = await request(`/establishments/${listing.body.establishment._id}/image`);
  assert.equal(publicImage.response.status, 200);
  assert.equal(publicImage.response.headers.get("content-type"), "image/png");

  const ownerSensitiveEdit = await request(`/establishments/${listing.body.establishment._id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${ownerRegistration.body.token}` },
    body: JSON.stringify({ address: "Updated address pending another review" }),
  });
  assert.equal(ownerSensitiveEdit.response.status, 200);
  assert.equal(ownerSensitiveEdit.body.establishment.verificationStatus, "pending");
  assert.equal(ownerSensitiveEdit.body.establishment.isActive, false);

  const publicAfterEdit = await request(`/establishments?query=${encodeURIComponent("Owner One Store")}`);
  assert.equal(publicAfterEdit.body.establishments.length, 0);
});

test("consumer reviews are owned, editable, removable, and update aggregate ratings", async (context) => {
  const { app } = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const request = async (path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    return { response, body: await response.json() };
  };
  const registration = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Review Consumer", email: `review-${suffix}@paynear.test`, password: "testing123", role: "user" }),
  });
  const token = registration.body.token;
  const listing = await createEstablishment({
    name: `Review Cafe ${suffix}`,
    category: "Cafe",
    address: "Test Street, Cebu City",
    latitude: 10.3157,
    longitude: 123.8854,
    acceptedPaymentMethods: ["GCash"],
    verificationStatus: "verified",
    isActive: true,
    openNow: true,
  });

  const publicDetail = await request(`/establishments/${listing._id}`);
  assert.equal(publicDetail.response.status, 200);

  const created = await request(`/establishments/${listing._id}/reviews/me`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rating: 5, comment: "Clear payment signs and helpful staff." }),
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.body.rating, 5);
  assert.equal(created.body.reviewCount, 1);

  const updated = await request(`/establishments/${listing._id}/reviews/me`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rating: 4, comment: "GCash worked and the listing was accurate." }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.rating, 4);
  assert.equal(updated.body.reviewCount, 1);

  const publicReviews = await request(`/establishments/${listing._id}/reviews`);
  assert.equal(publicReviews.response.status, 200);
  assert.equal(publicReviews.body.reviews.length, 1);
  assert.equal(publicReviews.body.reviews[0].userId, undefined);

  const removed = await request(`/establishments/${listing._id}/reviews/me`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(removed.response.status, 200);
  assert.equal(removed.body.reviewCount, 0);
  assert.equal(removed.body.rating, 0);
});

test("conversation history is isolated per consumer and owners receive an inbox", async (context) => {
  const { app } = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const register = async (name, role) => {
    const response = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email: `${name.toLowerCase().replaceAll(" ", "-")}-${suffix}@paynear.test`, password: "testing123", role }),
    });
    return response.json();
  };
  const owner = await register("Inbox Owner", "owner");
  const firstConsumer = await register("First Consumer", "user");
  const secondConsumer = await register("Second Consumer", "user");
  const listing = await createEstablishment({
    name: `Inbox Store ${suffix}`,
    category: "Grocery",
    address: "Test Avenue, Quezon City",
    latitude: 14.64,
    longitude: 121.049,
    acceptedPaymentMethods: ["GCash", "Cash"],
    verificationStatus: "verified",
    isActive: true,
    ownerName: owner.user.name,
    ownerUserId: owner.user.id,
    openNow: true,
  });
  await createMessage({ establishmentId: listing._id, conversationUserId: firstConsumer.user.id, senderUserId: firstConsumer.user.id, senderName: firstConsumer.user.name, senderRole: "user", body: "Do you accept GCash today?" });
  await createMessage({ establishmentId: listing._id, conversationUserId: secondConsumer.user.id, senderUserId: secondConsumer.user.id, senderName: secondConsumer.user.name, senderRole: "user", body: "Are you open late?" });

  const firstHistory = await getMessages(listing._id, firstConsumer.user.id);
  assert.equal(firstHistory.length, 1);
  assert.equal(firstHistory[0].body, "Do you accept GCash today?");

  const firstInboxResponse = await fetch(`${baseUrl}/conversations`, { headers: { Authorization: `Bearer ${firstConsumer.token}` } });
  const firstInbox = await firstInboxResponse.json();
  assert.equal(firstInbox.conversations.length, 1);
  assert.equal(firstInbox.conversations[0].conversationUserId, firstConsumer.user.id);

  const ownerInboxResponse = await fetch(`${baseUrl}/conversations`, { headers: { Authorization: `Bearer ${owner.token}` } });
  const ownerInbox = await ownerInboxResponse.json();
  assert.equal(ownerInbox.conversations.length, 2);

  const forbiddenCrossConversation = await fetch(`${baseUrl}/messages/${listing._id}?conversationUserId=${secondConsumer.user.id}`, { headers: { Authorization: `Bearer ${firstConsumer.token}` } });
  const firstConsumerBody = await forbiddenCrossConversation.json();
  assert.equal(firstConsumerBody.messages.length, 1);
  assert.equal(firstConsumerBody.messages[0].conversationUserId, firstConsumer.user.id);
});

test("favorite listings persist independently of current discovery filters", async (context) => {
  const { app } = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const registrationResponse = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Saved Consumer", email: `saved-${suffix}@paynear.test`, password: "testing123", role: "user" }),
  });
  const registration = await registrationResponse.json();
  const listing = (await listEstablishments({ query: "Brew & Go Cafe" }))[0];
  const favoriteResponse = await fetch(`${baseUrl}/account/favorites/${listing._id}`, { method: "POST", headers: { Authorization: `Bearer ${registration.token}` } });
  assert.equal(favoriteResponse.status, 200);
  const savedResponse = await fetch(`${baseUrl}/account/favorites`, { headers: { Authorization: `Bearer ${registration.token}` } });
  const saved = await savedResponse.json();
  assert.ok(saved.establishments.some((item) => item._id === listing._id));
});

test("consumer accounts can permanently delete themselves only after password confirmation", async (context) => {
  const { app } = createApp();
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const credentials = { name: "Deletion Consumer", email: `delete-${suffix}@paynear.test`, password: "testing123", role: "user" };
  const registrationResponse = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const registration = await registrationResponse.json();

  const rejected = await fetch(`${baseUrl}/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${registration.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrong-password" }),
  });
  assert.equal(rejected.status, 401);

  const deleted = await fetch(`${baseUrl}/account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${registration.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: credentials.password }),
  });
  assert.equal(deleted.status, 200);

  const formerSession = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${registration.token}` } });
  assert.equal(formerSession.status, 401);
  const formerLogin = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  });
  assert.equal(formerLogin.status, 401);
});
