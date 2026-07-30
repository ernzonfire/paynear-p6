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

test("business owners can create and manage only their own listings", async (context) => {
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

  const ownerRegistration = await request("/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Owner One", email: `owner-one-${suffix}@paynear.test`, password: "testing123", role: "owner" }),
  });
  assert.equal(ownerRegistration.response.status, 201);
  assert.equal(ownerRegistration.body.user.role, "owner");

  const listing = await request("/establishments", {
    method: "POST",
    headers: { Authorization: `Bearer ${ownerRegistration.body.token}` },
    body: JSON.stringify({ name: "Owner One Store", category: "Cafe", address: "Maribago, Lapu-Lapu City", acceptedPaymentMethods: ["GCash", "QR Ph"], openNow: true }),
  });
  assert.equal(listing.response.status, 201);
  assert.equal(listing.body.establishment.ownerName, "Owner One");
  assert.equal(listing.body.establishment.verificationStatus, "pending");

  const ownerListings = await request("/owner/establishments", { headers: { Authorization: `Bearer ${ownerRegistration.body.token}` } });
  assert.equal(ownerListings.response.status, 200);
  assert.ok(ownerListings.body.establishments.some((item) => item._id === listing.body.establishment._id));

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
});
