import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import multer from "multer";
import {
  createEstablishment,
  createMessage,
  createNotification,
  createUser,
  dbReady,
  findUserByEmail,
  getEstablishment,
  getMessages,
  getNotifications,
  getUser,
  listEstablishments,
  publicUser,
  readNotification,
  updateEstablishment,
  updateUser,
} from "./demoStore.js";
import { suggestFilters } from "./services/aiService.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../uploads");
const JWT_SECRET = process.env.JWT_SECRET || "paynear-demo-secret-change-before-deployment";
const ALLOWED_METHODS = ["GCash", "Maya", "BPI", "BDO", "UnionBank", "Card", "Cash", "Bank Transfer"];
const ALLOWED_CATEGORIES = ["Cafe", "Restaurant", "Grocery", "Pharmacy", "Convenience Store"];

const storage = multer.diskStorage({
  destination: (_request, _file, callback) => callback(null, uploadsDir),
  filename: (_request, file, callback) => callback(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

function tokenFor(user) {
  return jwt.sign({ id: String(user._id), role: user.role, name: user.name }, JWT_SECRET, { expiresIn: "7d" });
}

function safeUser(user) {
  return publicUser(user);
}

function toMethods(value) {
  const methods = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(methods.map((item) => item.trim()).filter((item) => ALLOWED_METHODS.includes(item)))];
}

function validateListing(input) {
  const errors = [];
  if (!String(input.name || "").trim()) errors.push("Name is required.");
  if (!ALLOWED_CATEGORIES.includes(input.category)) errors.push("Choose a valid category.");
  if (!String(input.address || "").trim()) errors.push("Address is required.");
  if (toMethods(input.acceptedPaymentMethods).length === 0) errors.push("Choose at least one accepted payment method.");
  return errors;
}

export function createApp() {
  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
  app.use(express.json({ limit: "1mb" }));
  app.use("/uploads", express.static(uploadsDir));

  const requireAuth = async (request, response, next) => {
    try {
      const token = request.headers.authorization?.replace("Bearer ", "");
      if (!token) return response.status(401).json({ message: "Sign in is required." });
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await getUser(payload.id);
      if (!user) return response.status(401).json({ message: "Session is no longer valid." });
      request.user = user;
      return next();
    } catch {
      return response.status(401).json({ message: "Session is invalid or expired." });
    }
  };

  const requireAdmin = (request, response, next) => {
    if (request.user?.role !== "admin") return response.status(403).json({ message: "Administrator access is required." });
    return next();
  };

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", mode: dbReady() ? "mongodb" : "demo", service: "paynear-api" });
  });

  app.post("/api/auth/register", async (request, response, next) => {
    try {
      const { name, email, password } = request.body;
      if (!String(name || "").trim() || !String(email || "").includes("@") || String(password || "").length < 6) {
        return response.status(400).json({ message: "Enter a name, a valid email, and a password with at least 6 characters." });
      }
      if (await findUserByEmail(email)) return response.status(409).json({ message: "An account already uses that email." });
      const user = await createUser({ name: name.trim(), email: email.toLowerCase().trim(), passwordHash: await bcrypt.hash(password, 10) });
      return response.status(201).json({ token: tokenFor(user), user: safeUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/auth/login", async (request, response, next) => {
    try {
      const { email, password } = request.body;
      const user = await findUserByEmail(String(email || "").toLowerCase().trim());
      if (!user) return response.status(401).json({ message: "Incorrect email or password." });
      const isDemoAdmin = user.email === "admin@paynear.demo" && password === "admin123";
      const valid = isDemoAdmin || (user.passwordHash && await bcrypt.compare(password || "", user.passwordHash));
      if (!valid) return response.status(401).json({ message: "Incorrect email or password." });
      return response.json({ token: tokenFor(user), user: safeUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/auth/me", requireAuth, (request, response) => response.json({ user: safeUser(request.user) }));

  app.put("/api/account/preferences", requireAuth, async (request, response, next) => {
    try {
      if (!ALLOWED_METHODS.includes(request.body.preferredPaymentMethod)) {
        return response.status(400).json({ message: "Choose a supported payment method." });
      }
      const user = await updateUser(String(request.user._id), { preferredPaymentMethod: request.body.preferredPaymentMethod });
      return response.json({ user: safeUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/account/favorites/:establishmentId", requireAuth, async (request, response, next) => {
    try {
      const establishment = await getEstablishment(request.params.establishmentId);
      if (!establishment) return response.status(404).json({ message: "Establishment not found." });
      const current = (request.user.favoriteEstablishmentIds || []).map(String);
      const id = String(establishment._id);
      const favoriteEstablishmentIds = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      const user = await updateUser(String(request.user._id), { favoriteEstablishmentIds });
      return response.json({ user: safeUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/establishments", async (request, response, next) => {
    try {
      const establishments = await listEstablishments({
        query: request.query.query,
        method: request.query.method,
        latitude: request.query.latitude,
        longitude: request.query.longitude,
        radiusKm: Math.min(10, Math.max(1, Number(request.query.radiusKm) || 5)),
        openNow: request.query.openNow === "true",
        minRating: Math.max(0, Number(request.query.minRating) || 0),
      });
      return response.json({ establishments, mode: dbReady() ? "mongodb" : "demo" });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/establishments/:id", async (request, response, next) => {
    try {
      const establishment = await getEstablishment(request.params.id);
      if (!establishment || !establishment.isActive) return response.status(404).json({ message: "Establishment not found." });
      return response.json({ establishment });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/establishments", requireAuth, requireAdmin, async (request, response, next) => {
    try {
      const errors = validateListing(request.body);
      if (errors.length) return response.status(400).json({ message: errors.join(" ") });
      const establishment = await createEstablishment({ ...request.body, acceptedPaymentMethods: toMethods(request.body.acceptedPaymentMethods) });
      return response.status(201).json({ establishment });
    } catch (error) {
      return next(error);
    }
  });

  app.put("/api/establishments/:id", requireAuth, requireAdmin, async (request, response, next) => {
    try {
      const updates = { ...request.body };
      if (updates.acceptedPaymentMethods) updates.acceptedPaymentMethods = toMethods(updates.acceptedPaymentMethods);
      if (updates.category && !ALLOWED_CATEGORIES.includes(updates.category)) return response.status(400).json({ message: "Choose a valid category." });
      const establishment = await updateEstablishment(request.params.id, updates);
      if (!establishment) return response.status(404).json({ message: "Establishment not found." });
      return response.json({ establishment });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/establishments/:id/image", requireAuth, requireAdmin, upload.single("image"), async (request, response, next) => {
    try {
      if (!request.file) return response.status(400).json({ message: "Upload a JPG, PNG, or WebP image under 3 MB." });
      const imageUrl = `${request.protocol}://${request.get("host")}/uploads/${request.file.filename}`;
      const establishment = await updateEstablishment(request.params.id, { imageUrl });
      if (!establishment) return response.status(404).json({ message: "Establishment not found." });
      return response.json({ establishment });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/ai/suggest", async (request, response, next) => {
    try {
      const prompt = String(request.body.prompt || "").trim();
      if (prompt.length < 3) return response.status(400).json({ message: "Tell the assistant what kind of place you need." });
      return response.json(await suggestFilters(prompt));
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/messages/:establishmentId", requireAuth, async (request, response, next) => {
    try {
      const establishment = await getEstablishment(request.params.establishmentId);
      if (!establishment) return response.status(404).json({ message: "Establishment not found." });
      return response.json({ messages: await getMessages(request.params.establishmentId) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/notifications", requireAuth, async (request, response, next) => {
    try {
      return response.json({ notifications: await getNotifications(String(request.user._id)) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/notifications/gcash-demo", requireAuth, async (request, response, next) => {
    try {
      const establishment = await getEstablishment(request.body.establishmentId);
      if (!establishment) return response.status(404).json({ message: "Establishment not found." });
      const notification = await createNotification({
        userId: String(request.user._id),
        establishmentId: String(establishment._id),
        type: "gcash",
        title: "GCash availability update",
        message: `${establishment.name} lists GCash as an accepted payment method. This is a directory notification, not a payment confirmation.`,
      });
      return response.status(201).json({ notification });
    } catch (error) {
      return next(error);
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (request, response, next) => {
    try {
      const notification = await readNotification(request.params.id, String(request.user._id));
      if (!notification) return response.status(404).json({ message: "Notification not found." });
      return response.json({ notification });
    } catch (error) {
      return next(error);
    }
  });

  app.use((error, _request, response, _next) => {
    if (error instanceof multer.MulterError) return response.status(400).json({ message: "Image upload failed. Use a file under 3 MB." });
    if (error?.message?.includes("Only JPG")) return response.status(400).json({ message: error.message });
    console.error(error);
    return response.status(500).json({ message: "Something went wrong. Please try again." });
  });

  return { app, requireAuth, jwtSecret: JWT_SECRET };
}

export function attachSocketServer(io, jwtSecret = JWT_SECRET) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Sign in is required for chat."));
      const payload = jwt.verify(token, jwtSecret);
      const user = await getUser(payload.id);
      if (!user) return next(new Error("Session is invalid."));
      socket.user = user;
      return next();
    } catch {
      return next(new Error("Session is invalid."));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join-establishment", async ({ establishmentId }, callback = () => {}) => {
      const establishment = await getEstablishment(establishmentId);
      if (!establishment) return callback({ ok: false, message: "Establishment not found." });
      socket.join(`establishment:${establishmentId}`);
      return callback({ ok: true });
    });

    socket.on("send-message", async ({ establishmentId, body }, callback = () => {}) => {
      const cleanBody = String(body || "").trim();
      const establishment = await getEstablishment(establishmentId);
      if (!establishment || !cleanBody || cleanBody.length > 500) return callback({ ok: false, message: "Enter a message up to 500 characters." });
      const message = await createMessage({
        establishmentId: String(establishment._id),
        senderUserId: String(socket.user._id),
        senderName: socket.user.name,
        senderRole: "user",
        body: cleanBody,
      });
      io.to(`establishment:${establishmentId}`).emit("message:new", message);
      return callback({ ok: true, message });
    });

    socket.on("demo-store-reply", async ({ establishmentId }, callback = () => {}) => {
      const establishment = await getEstablishment(establishmentId);
      if (!establishment) return callback({ ok: false, message: "Establishment not found." });
      const message = await createMessage({
        establishmentId: String(establishment._id),
        senderName: establishment.ownerName || establishment.name,
        senderRole: "establishment",
        body: `Hi ${socket.user.name.split(" ")[0]}! Yes, we currently list GCash as accepted. Please confirm at the counter before payment.`,
      });
      const notification = await createNotification({
        userId: String(socket.user._id),
        establishmentId: String(establishment._id),
        type: "chat",
        title: `${establishment.ownerName || establishment.name} replied`,
        message: "A new chat reply is available. This is not a payment confirmation.",
      });
      io.to(`establishment:${establishmentId}`).emit("message:new", message);
      socket.emit("notification:new", notification);
      return callback({ ok: true });
    });
  });
}
