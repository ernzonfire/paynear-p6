const PAYMENT_KEYWORDS = ["GCash", "Maya", "QR Ph", "InstaPay", "BPI", "BDO", "UnionBank", "Card", "Cash", "Bank Transfer"];
const CATEGORY_KEYWORDS = ["Cafe", "Restaurant", "Grocery", "Pharmacy", "Convenience Store"];

function normalize(value) {
  return String(value || "").toLowerCase();
}

function localSuggestion(prompt) {
  const text = normalize(prompt);
  const method = PAYMENT_KEYWORDS.find((item) => text.includes(item.toLowerCase())) || "";
  const category = CATEGORY_KEYWORDS.find((item) => text.includes(item.toLowerCase())) || "";
  const openNow = /open|kar[o]n|today|tonight/.test(text);
  const radiusMatch = text.match(/(\d+(?:\.\d+)?)\s*(km|kilometer|kilometre)/);
  const radiusKm = radiusMatch ? Math.min(10, Math.max(1, Number(radiusMatch[1]))) : 3;
  const minRating = /highly rated|best|top rated|4\.5/.test(text) ? 4.5 : 0;

  const readable = [category || "nearby places", method && `accepting ${method}`, openNow && "open now"]
    .filter(Boolean)
    .join(", ");

  return {
    filters: { query: category, method, radiusKm, openNow, minRating },
    message: `I suggested filters for ${readable || "nearby places"} within ${radiusKm} km. You can review them before applying.`,
    provider: "local-fallback",
  };
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export async function suggestFilters(prompt) {
  const fallback = localSuggestion(prompt);
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;

  if (!apiKey || !model) return fallback;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "system",
            content: "You convert a PayNear user request into search filters. Return JSON only with query, method, radiusKm, openNow, minRating, and message. Allowed methods: GCash, Maya, QR Ph, InstaPay, BPI, BDO, UnionBank, Card, Cash, Bank Transfer. Allowed categories: Cafe, Restaurant, Grocery, Pharmacy, Convenience Store. Do not give financial, payment, or factual advice beyond filter suggestions.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) return fallback;

    const payload = await response.json();
    const parsed = extractJson(payload.output_text || "");
    if (!parsed) return fallback;

    return {
      filters: {
        query: CATEGORY_KEYWORDS.includes(parsed.query) ? parsed.query : fallback.filters.query,
        method: PAYMENT_KEYWORDS.includes(parsed.method) ? parsed.method : fallback.filters.method,
        radiusKm: Number.isFinite(Number(parsed.radiusKm)) ? Math.min(10, Math.max(1, Number(parsed.radiusKm))) : fallback.filters.radiusKm,
        openNow: Boolean(parsed.openNow),
        minRating: Number(parsed.minRating) >= 0 ? Math.min(5, Number(parsed.minRating)) : fallback.filters.minRating,
      },
      message: typeof parsed.message === "string" ? parsed.message.slice(0, 220) : fallback.message,
      provider: "openai",
    };
  } catch {
    return fallback;
  }
}
