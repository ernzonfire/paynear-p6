import assert from "node:assert/strict";
import test from "node:test";
import { listEstablishments } from "../src/demoStore.js";
import { suggestFilters } from "../src/services/aiService.js";

test("advanced filtering returns only matching open GCash places", async () => {
  const results = await listEstablishments({ method: "GCash", openNow: true, radiusKm: 2, minRating: 4.5 });
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.openNow));
  assert.ok(results.every((item) => item.acceptedPaymentMethods.includes("GCash")));
  assert.ok(results.every((item) => item.distanceKm <= 2));
});

test("nearby filtering uses coordinates and the selected radius", async () => {
  const results = await listEstablishments({ latitude: 14.6351, longitude: 121.0342, radiusKm: 1, method: "GCash" });
  assert.ok(results.length > 0);
  assert.ok(results.every((item) => item.distanceKm <= 1));
  assert.equal(results[0].name, "Brew & Go Cafe");
  assert.equal(results[0].ownerName, "Ariana Santos");
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
