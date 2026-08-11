import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { createApp } from "../src/app.js";
import { listEstablishments } from "../src/demoStore.js";
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

test("demo listings support nearby searches in Lapu-Lapu, Mawaque, and Baguio", async () => {
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

test("demo user, owner, and administrator accounts sign in with the correct roles", async (context) => {
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

  const accounts = [
    { email: "user@paynear.demo", password: "user123", role: "user" },
    { email: "owner@paynear.demo", password: "owner123", role: "owner" },
    { email: "admin@paynear.demo", password: "admin123", role: "admin" },
  ];

  for (const account of accounts) {
    const result = await login(account.email, account.password);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.user.role, account.role);
    assert.ok(result.body.token);
  }

  const wrongPassword = await login("admin@paynear.demo", "incorrect-password");
  assert.equal(wrongPassword.response.status, 401);

  const owner = await login("owner@paynear.demo", "owner123");
  const ownerListings = await fetch(`${baseUrl}/owner/establishments`, {
    headers: { Authorization: `Bearer ${owner.body.token}` },
  });
  const ownerListingsBody = await ownerListings.json();
  assert.equal(ownerListings.status, 200);
  assert.ok(ownerListingsBody.establishments.some((item) => item.name === "Sampaguita Kitchen"));
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

  const adminLogin = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "admin@paynear.demo", password: "admin123" }),
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
