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
  getEstablishmentImage,
  getMessages,
  getNotifications,
  getUser,
  listEstablishments,
  listAdminEstablishments,
  listOwnerEstablishments,
  publicUser,
  readNotification,
  updateEstablishment,
  updateUser,
} from "./demoStore.js";
import { suggestFilters } from "./services/aiService.js";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "paynear-development-secret-change-before-deployment";
const ALLOWED_METHODS = ["GCash", "Maya", "QR Ph", "InstaPay", "BPI", "BDO", "UnionBank", "Card", "Cash", "Bank Transfer"];
const ALLOWED_CATEGORIES = ["Cafe", "Restaurant", "Grocery", "Pharmacy", "Convenience Store"];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => callback(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

function tokenFor(user) {
  return jwt.sign({ id: String(user._id), role: user.role, name: user.name, version: Number(user.sessionVersion || 0) }, JWT_SECRET, { expiresIn: "7d" });
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
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  if (input.latitude === "" || input.latitude === null || input.latitude === undefined || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) errors.push("Enter a valid latitude.");
  if (input.longitude === "" || input.longitude === null || input.longitude === undefined || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) errors.push("Enter a valid longitude.");
  return errors;
}

function publicEstablishment(establishment) {
  const listing = { ...establishment };
  delete listing.ownerUserId;
  delete listing.reviewedByUserId;
  delete listing.reviewNotes;
  delete listing.submittedAt;
  return listing;
}

function isPublished(establishment) {
  return establishment?.verificationStatus === "verified" && establishment?.isActive === true;
}

function canAccessEstablishment(user, establishment) {
  return isPublished(establishment)
    || user?.role === "admin"
    || (user?.role === "owner" && String(establishment?.ownerUserId || "") === String(user?._id || ""));
}

function listingImageUrl(request, id) {
  const apiOrigin = String(process.env.PUBLIC_API_URL || "").replace(/\/$/, "");
  return `${apiOrigin || `${request.protocol}://${request.get("host")}`}/api/establishments/${id}/image?v=${Date.now()}`;
}

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
  app.use(express.json({ limit: "1mb" }));

  const requireAuth = async (request, response, next) => {
    try {
      const token = request.headers.authorization?.replace("Bearer ", "");
      if (!token) return response.status(401).json({ message: "Sign in is required." });
      const payload = jwt.verify(token, JWT_SECRET);
      const user = await getUser(payload.id);
      if (!user) return response.status(401).json({ message: "Session is no longer valid." });
      if (Number(payload.version || 0) !== Number(user.sessionVersion || 0)) {
        return response.status(401).json({ message: "Session is no longer valid. Sign in again." });
      }
      request.user = user;
      return next();
    } catch {
      return response.status(401).json({ message: "Session is invalid or expired." });
    }
  };

  const requirePasswordChanged = (request, response, next) => {
    if (request.user?.mustChangePassword) {
      return response.status(403).json({ message: "Set a new password before using your PayNear account.", code: "PASSWORD_CHANGE_REQUIRED" });
    }
    return next();
  };

  const requireOwner = (request, response, next) => {
    if (request.user?.role !== "owner") return response.status(403).json({ message: "Business owner access is required." });
    return next();
  };

  const requireAdmin = (request, response, next) => {
    if (request.user?.role !== "admin") return response.status(403).json({ message: "Administrator access is required." });
    return next();
  };

  const canManageListing = (user, establishment) => user?.role === "admin"
    || (user?.role === "owner" && String(establishment.ownerUserId || "") === String(user._id));

  app.get("/api/health", (_request, response) => {
    response.json({
      status: "ok",
      mode: dbReady() ? "mongodb" : "memory",
      service: "paynear-api",
      revision: String(process.env.RENDER_GIT_COMMIT || "local").slice(0, 7),
    });
  });

  app.post("/api/auth/register", async (request, response, next) => {
    try {
      const { name, email, password } = request.body;
      const role = request.body.role === "owner" ? "owner" : "user";
      if (!String(name || "").trim() || !String(email || "").includes("@") || String(password || "").length < 8) {
        return response.status(400).json({ message: "Enter a name, a valid email, and a password with at least 8 characters." });
      }
      if (await findUserByEmail(email)) return response.status(409).json({ message: "An account already uses that email." });
      const user = await createUser({ name: name.trim(), email: email.toLowerCase().trim(), passwordHash: await bcrypt.hash(password, 10), role });
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
      const valid = user.passwordHash && await bcrypt.compare(password || "", user.passwordHash);
      if (!valid) return response.status(401).json({ message: "Incorrect email or password." });
      return response.json({ token: tokenFor(user), user: safeUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/auth/me", requireAuth, (request, response) => response.json({ user: safeUser(request.user) }));

  app.post("/api/auth/change-password", requireAuth, async (request, response, next) => {
    try {
      if (!request.user.mustChangePassword) {
        return response.status(409).json({ message: "This account has already completed its required password change." });
      }
      const newPassword = String(request.body.newPassword || "");
      const minimumLength = request.user.role === "admin" ? 12 : 8;
      if (newPassword.length < minimumLength) {
        return response.status(400).json({ message: `Use a new password with at least ${minimumLength} characters.` });
      }
      if (await bcrypt.compare(newPassword, request.user.passwordHash)) {
        return response.status(400).json({ message: "Your new password must be different from the temporary password." });
      }
      const user = await updateUser(String(request.user._id), {
        passwordHash: await bcrypt.hash(newPassword, 12),
        mustChangePassword: false,
        sessionVersion: Number(request.user.sessionVersion || 0) + 1,
      });
      return response.json({ token: tokenFor(user), user: safeUser(user) });
    } catch (error) {
      return next(error);
    }
  });

  app.put("/api/account/preferences", requireAuth, requirePasswordChanged, async (request, response, next) => {
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

  app.post("/api/account/favorites/:establishmentId", requireAuth, requirePasswordChanged, async (request, response, next) => {
    try {
      const establishment = await getEstablishment(request.params.establishmentId);
      if (!isPublished(establishment)) return response.status(404).json({ message: "Establishment not found." });
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
      return response.json({ establishments: establishments.map(publicEstablishment), mode: dbReady() ? "mongodb" : "memory" });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/establishments/:id", async (request, response, next) => {
    try {
      const establishment = await getEstablishment(request.params.id);
      if (!establishment || !establishment.isActive || establishment.verificationStatus !== "verified") {
        return response.status(404).json({ message: "Establishment not found." });
      }
      return response.json({ establishment: publicEstablishment(establishment) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/establishments/:id/image", async (request, response, next) => {
    try {
      const image = await getEstablishmentImage(request.params.id);
      if (!image) return response.status(404).json({ message: "Listing image not found." });
      response.set({
        "Cache-Control": "public, max-age=86400, immutable",
        "Content-Type": image.contentType,
      });
      return response.send(image.data);
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/owner/establishments", requireAuth, requirePasswordChanged, requireOwner, async (request, response, next) => {
    try {
      return response.json({ establishments: await listOwnerEstablishments(String(request.user._id)) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/admin/establishments", requireAuth, requirePasswordChanged, requireAdmin, async (request, response, next) => {
    try {
      return response.json({ establishments: await listAdminEstablishments(String(request.query.status || "")) });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/establishments", requireAuth, requirePasswordChanged, async (request, response, next) => {
    try {
      if (!["admin", "owner"].includes(request.user.role)) {
        return response.status(403).json({ message: "Business owner or administrator access is required." });
      }
      const errors = validateListing(request.body);
      if (errors.length) return response.status(400).json({ message: errors.join(" ") });
      const ownerInput = request.user.role === "owner"
        ? {
          ownerName: request.user.name,
          ownerTitle: "Business owner",
          ownerUserId: String(request.user._id),
          verificationStatus: "pending",
          isActive: false,
          submittedAt: new Date(),
        }
        : { verificationStatus: "pending", isActive: false, submittedAt: new Date() };
      const establishment = await createEstablishment({
        name: String(request.body.name).trim(),
        category: request.body.category,
        address: String(request.body.address).trim(),
        latitude: Number(request.body.latitude),
        longitude: Number(request.body.longitude),
        openNow: Boolean(request.body.openNow),
        ownerName: request.user.role === "admin" ? String(request.body.ownerName || "").trim() : undefined,
        ownerTitle: request.user.role === "admin" ? String(request.body.ownerTitle || "").trim() : undefined,
        acceptedPaymentMethods: toMethods(request.body.acceptedPaymentMethods),
        ...ownerInput,
      });
      return response.status(201).json({ establishment });
    } catch (error) {
      return next(error);
    }
  });

  app.put("/api/establishments/:id", requireAuth, requirePasswordChanged, async (request, response, next) => {
    try {
      const existing = await getEstablishment(request.params.id);
      if (!existing) return response.status(404).json({ message: "Establishment not found." });
      if (!canManageListing(request.user, existing)) return response.status(403).json({ message: "You can manage only your own listings." });

      const ownerAllowedFields = ["name", "category", "address", "acceptedPaymentMethods", "openNow", "latitude", "longitude"];
      const adminAllowedFields = [...ownerAllowedFields, "ownerName", "ownerTitle", "isActive"];
      const allowedFields = request.user.role === "owner" ? ownerAllowedFields : adminAllowedFields;
      const updates = Object.fromEntries(Object.entries(request.body).filter(([key]) => allowedFields.includes(key)));
      if (updates.acceptedPaymentMethods) updates.acceptedPaymentMethods = toMethods(updates.acceptedPaymentMethods);
      if (updates.category && !ALLOWED_CATEGORIES.includes(updates.category)) return response.status(400).json({ message: "Choose a valid category." });
      if (updates.latitude !== undefined || updates.longitude !== undefined) {
        const currentCoordinates = existing.location?.coordinates || [];
        const longitude = Number(updates.longitude ?? currentCoordinates[0]);
        const latitude = Number(updates.latitude ?? currentCoordinates[1]);
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
          return response.status(400).json({ message: "Enter valid latitude and longitude values." });
        }
        updates.location = { type: "Point", coordinates: [longitude, latitude] };
        delete updates.latitude;
        delete updates.longitude;
      }
      const requiresReview = request.user.role === "owner"
        && Object.keys(updates).some((key) => ["name", "category", "address", "acceptedPaymentMethods", "location"].includes(key));
      if (requiresReview) {
        Object.assign(updates, {
          verificationStatus: "pending",
          isActive: false,
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedByUserId: null,
          reviewNotes: "",
          publishedAt: null,
        });
      } else if (updates.isActive === true && existing.verificationStatus !== "verified") {
        return response.status(400).json({ message: "Only verified listings can be published." });
      }
      const establishment = await updateEstablishment(request.params.id, updates);
      if (!establishment) return response.status(404).json({ message: "Establishment not found." });
      return response.json({ establishment });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/establishments/:id/image", requireAuth, requirePasswordChanged, upload.single("image"), async (request, response, next) => {
    try {
      if (!request.file) return response.status(400).json({ message: "Upload a JPG, PNG, or WebP image under 3 MB." });
      const existing = await getEstablishment(request.params.id);
      if (!existing) return response.status(404).json({ message: "Establishment not found." });
      if (!canManageListing(request.user, existing)) return response.status(403).json({ message: "You can manage only your own listings." });
      const moderationUpdates = request.user.role === "owner"
        ? {
          verificationStatus: "pending",
          isActive: false,
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedByUserId: null,
          reviewNotes: "",
          publishedAt: null,
        }
        : {};
      const establishment = await updateEstablishment(request.params.id, {
        ...moderationUpdates,
        imageData: request.file.buffer,
        imageContentType: request.file.mimetype,
        imageUrl: listingImageUrl(request, request.params.id),
      });
      if (!establishment) return response.status(404).json({ message: "Establishment not found." });
      return response.json({ establishment });
    } catch (error) {
      return next(error);
    }
  });

  app.patch("/api/admin/establishments/:id/review", requireAuth, requirePasswordChanged, requireAdmin, async (request, response, next) => {
    try {
      const establishment = await getEstablishment(request.params.id);
      if (!establishment) return response.status(404).json({ message: "Establishment not found." });
      const action = String(request.body.action || "");
      const reviewNotes = String(request.body.reviewNotes || "").trim().slice(0, 500);
      if (!new Set(["verify", "reject", "request_changes"]).has(action)) {
        return response.status(400).json({ message: "Choose verify, reject, or request changes." });
      }
      if (action !== "verify" && !reviewNotes) {
        return response.status(400).json({ message: "Add review notes so the owner knows what to change." });
      }
      if (action === "verify" && !establishment.imageUrl) {
        return response.status(400).json({ message: "A store image is required before verification." });
      }
      const verificationStatus = action === "verify"
        ? "verified"
        : action === "reject" ? "rejected" : "changes_requested";
      const reviewedAt = new Date();
      const updated = await updateEstablishment(request.params.id, {
        verificationStatus,
        isActive: action === "verify",
        reviewedAt,
        reviewedByUserId: String(request.user._id),
        reviewNotes,
        publishedAt: action === "verify" ? reviewedAt : null,
      });
      if (updated.ownerUserId) {
        await createNotification({
          userId: String(updated.ownerUserId),
          establishmentId: String(updated._id),
          type: "listing",
          title: action === "verify" ? "Store listing published" : action === "reject" ? "Store listing rejected" : "Store listing needs changes",
          message: action === "verify"
            ? `${updated.name} is verified and now visible on PayNear.`
            : reviewNotes,
        });
      }
      return response.json({ establishment: updated });
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

  app.get("/api/messages/:establishmentId", requireAuth, requirePasswordChanged, async (request, response, next) => {
    try {
      const establishment = await getEstablishment(request.params.establishmentId);
      if (!establishment || !canAccessEstablishment(request.user, establishment)) return response.status(404).json({ message: "Establishment not found." });
      return response.json({ messages: await getMessages(request.params.establishmentId) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/notifications", requireAuth, requirePasswordChanged, async (request, response, next) => {
    try {
      return response.json({ notifications: await getNotifications(String(request.user._id)) });
    } catch (error) {
      return next(error);
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, requirePasswordChanged, async (request, response, next) => {
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
      if (Number(payload.version || 0) !== Number(user.sessionVersion || 0)) return next(new Error("Session is invalid."));
      if (user.mustChangePassword) return next(new Error("Set a new password before using chat."));
      socket.user = user;
      return next();
    } catch {
      return next(new Error("Session is invalid."));
    }
  });

  io.on("connection", (socket) => {
    socket.on("join-establishment", async ({ establishmentId }, callback = () => {}) => {
      const establishment = await getEstablishment(establishmentId);
      if (!establishment || !canAccessEstablishment(socket.user, establishment)) return callback({ ok: false, message: "Establishment not found." });
      socket.join(`establishment:${establishmentId}`);
      return callback({ ok: true });
    });

    socket.on("send-message", async ({ establishmentId, body }, callback = () => {}) => {
      const cleanBody = String(body || "").trim();
      const establishment = await getEstablishment(establishmentId);
      if (!establishment || !canAccessEstablishment(socket.user, establishment) || !cleanBody || cleanBody.length > 500) {
        return callback({ ok: false, message: "Enter a message up to 500 characters." });
      }
      const isListingOwner = socket.user.role === "owner" && String(establishment.ownerUserId || "") === String(socket.user._id);
      const message = await createMessage({
        establishmentId: String(establishment._id),
        senderUserId: String(socket.user._id),
        senderName: isListingOwner ? (establishment.ownerName || socket.user.name) : socket.user.name,
        senderRole: isListingOwner ? "establishment" : "user",
        body: cleanBody,
      });
      io.to(`establishment:${establishmentId}`).emit("message:new", message);
      return callback({ ok: true, message });
    });

  });
}
