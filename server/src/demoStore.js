import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { Establishment, Message, Notification, User } from "./models.js";

const defaultEstablishments = [
  {
    _id: "demo-cafe-1",
    name: "Brew & Go Cafe",
    category: "Cafe",
    address: "Tomas Morato, Quezon City",
    distanceKm: 0.6,
    location: { type: "Point", coordinates: [121.0342, 14.6351] },
    ownerName: "Ariana Santos",
    ownerTitle: "Cafe owner",
    acceptedPaymentMethods: ["GCash", "Maya", "Cash", "Card"],
    verificationStatus: "verified",
    isActive: true,
    openNow: true,
    rating: 4.8,
    reviewCount: 184,
    imageUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80",
  },
  {
    _id: "demo-grocery-1",
    name: "Metro Fresh Mart",
    category: "Grocery",
    address: "Cubao, Quezon City",
    distanceKm: 1.2,
    location: { type: "Point", coordinates: [121.0529, 14.619] },
    ownerName: "Miguel Reyes",
    ownerTitle: "Store manager",
    acceptedPaymentMethods: ["GCash", "BPI", "BDO", "Card", "Cash"],
    verificationStatus: "verified",
    isActive: true,
    openNow: true,
    rating: 4.5,
    reviewCount: 96,
    imageUrl: "https://images.unsplash.com/photo-1601598851547-4302969d0614?auto=format&fit=crop&w=900&q=80",
  },
  {
    _id: "demo-pharmacy-1",
    name: "CarePlus Pharmacy",
    category: "Pharmacy",
    address: "Katipunan, Quezon City",
    distanceKm: 1.8,
    location: { type: "Point", coordinates: [121.0744, 14.6503] },
    ownerName: "Carla Villanueva",
    ownerTitle: "Pharmacy manager",
    acceptedPaymentMethods: ["GCash", "Maya", "BPI", "Cash"],
    verificationStatus: "verified",
    isActive: true,
    openNow: true,
    rating: 4.7,
    reviewCount: 65,
    imageUrl: "https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=900&q=80",
  },
  {
    _id: "demo-restaurant-1",
    name: "Sampaguita Kitchen",
    category: "Restaurant",
    address: "Scout Borromeo, Quezon City",
    distanceKm: 2.7,
    location: { type: "Point", coordinates: [121.0323, 14.6373] },
    ownerName: "Rafael Cruz",
    ownerTitle: "Restaurant owner",
    acceptedPaymentMethods: ["Cash", "Card", "BDO"],
    verificationStatus: "pending",
    isActive: true,
    openNow: false,
    rating: 4.3,
    reviewCount: 48,
    imageUrl: "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=900&q=80",
  },
  {
    _id: "demo-convenience-1",
    name: "QuickStop 24/7",
    category: "Convenience Store",
    address: "UP Diliman, Quezon City",
    distanceKm: 3.1,
    location: { type: "Point", coordinates: [121.0684, 14.6516] },
    ownerName: "Paolo Lim",
    ownerTitle: "Branch manager",
    acceptedPaymentMethods: ["GCash", "Maya", "UnionBank", "Cash"],
    verificationStatus: "verified",
    isActive: true,
    openNow: true,
    rating: 4.2,
    reviewCount: 39,
    imageUrl: "https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=900&q=80",
  },
];

const memory = {
  establishments: structuredClone(defaultEstablishments),
  users: [
    { _id: "demo-admin", name: "PayNear Admin", email: "admin@paynear.demo", role: "admin", preferredPaymentMethod: "GCash", favoriteEstablishmentIds: [] },
  ],
  messages: [],
  notifications: [],
};

export const dbReady = () => mongoose.connection.readyState === 1;
export const publicUser = (user) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  role: user.role,
  preferredPaymentMethod: user.preferredPaymentMethod || "GCash",
  favoriteEstablishmentIds: (user.favoriteEstablishmentIds || []).map(String),
});

function normalizeEstablishment(item) {
  const plain = item.toObject ? item.toObject() : item;
  return { ...plain, _id: String(plain._id), distanceKm: plain.distanceKm ?? 1.4 };
}

function calculateDistanceKm(latitude, longitude, location) {
  if (!location?.coordinates?.length) return null;
  const [targetLongitude, targetLatitude] = location.coordinates;
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(targetLatitude - latitude);
  const deltaLongitude = toRadians(targetLongitude - longitude);
  const start = toRadians(latitude);
  const end = toRadians(targetLatitude);
  const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(start) * Math.cos(end) * Math.sin(deltaLongitude / 2) ** 2;
  return Math.round(earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

export async function listEstablishments(filters = {}) {
  const { query = "", method = "", radiusKm = 5, openNow = false, minRating = 0, latitude, longitude } = filters;
  const hasLocation = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
  const parsedLatitude = Number(latitude);
  const parsedLongitude = Number(longitude);
  if (dbReady()) {
    const mongoFilter = { isActive: true, rating: { $gte: Number(minRating) || 0 } };
    if (query) mongoFilter.$or = [{ name: { $regex: query, $options: "i" } }, { category: { $regex: query, $options: "i" } }];
    if (method) mongoFilter.acceptedPaymentMethods = method;
    if (openNow) mongoFilter.openNow = true;
    if (hasLocation) mongoFilter.location = { $near: { $geometry: { type: "Point", coordinates: [parsedLongitude, parsedLatitude] }, $maxDistance: Number(radiusKm || 5) * 1000 } };
    const queryBuilder = Establishment.find(mongoFilter);
    if (!hasLocation) queryBuilder.sort({ rating: -1, createdAt: -1 });
    const records = await queryBuilder.lean();
    return records.map(normalizeEstablishment).map((item) => ({ ...item, distanceKm: hasLocation ? calculateDistanceKm(parsedLatitude, parsedLongitude, item.location) : item.distanceKm }));
  }

  const queryLower = query.toLowerCase();
  return memory.establishments
    .filter((item) => item.isActive)
    .filter((item) => !queryLower || item.name.toLowerCase().includes(queryLower) || item.category.toLowerCase().includes(queryLower))
    .filter((item) => !method || item.acceptedPaymentMethods.includes(method))
    .filter((item) => !openNow || item.openNow)
    .filter((item) => item.rating >= Number(minRating || 0))
    .map((item) => ({ ...item, distanceKm: hasLocation ? calculateDistanceKm(parsedLatitude, parsedLongitude, item.location) : item.distanceKm }))
    .filter((item) => item.distanceKm !== null && item.distanceKm <= Number(radiusKm || 5))
    .sort((a, b) => a.distanceKm - b.distanceKm || b.rating - a.rating);
}

export async function getEstablishment(id) {
  if (dbReady()) {
    if (!mongoose.isValidObjectId(id)) return null;
    const record = await Establishment.findById(id).lean();
    return record ? normalizeEstablishment(record) : null;
  }
  return memory.establishments.find((item) => item._id === id) || null;
}

export async function createEstablishment(input) {
  const record = {
    name: input.name,
    category: input.category,
    address: input.address,
    acceptedPaymentMethods: input.acceptedPaymentMethods || ["GCash", "Cash"],
    imageUrl: input.imageUrl || "",
    verificationStatus: input.verificationStatus || "pending",
    isActive: true,
    openNow: Boolean(input.openNow),
    rating: Number(input.rating || 4.5),
    reviewCount: 0,
    ownerName: input.ownerName || "Unassigned owner",
    ownerTitle: input.ownerTitle || "Listing contact",
    location: { type: "Point", coordinates: [Number(input.longitude || 121.049), Number(input.latitude || 14.64)] },
  };
  if (dbReady()) return normalizeEstablishment(await Establishment.create(record));
  const saved = { ...record, _id: `demo-${randomUUID()}`, distanceKm: Number(input.distanceKm || 1.5) };
  memory.establishments.unshift(saved);
  return saved;
}

export async function updateEstablishment(id, updates) {
  if (dbReady()) {
    if (!mongoose.isValidObjectId(id)) return null;
    const record = await Establishment.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).lean();
    return record ? normalizeEstablishment(record) : null;
  }
  const index = memory.establishments.findIndex((item) => item._id === id);
  if (index < 0) return null;
  memory.establishments[index] = { ...memory.establishments[index], ...updates };
  return memory.establishments[index];
}

export async function findUserByEmail(email) {
  if (dbReady()) return User.findOne({ email: email.toLowerCase() });
  return memory.users.find((item) => item.email === email.toLowerCase()) || null;
}

export async function getUser(id) {
  if (dbReady()) return mongoose.isValidObjectId(id) ? User.findById(id) : null;
  return memory.users.find((item) => item._id === id) || null;
}

export async function createUser(input) {
  if (dbReady()) return User.create(input);
  const user = { _id: `demo-${randomUUID()}`, role: "user", favoriteEstablishmentIds: [], preferredPaymentMethod: "GCash", ...input };
  memory.users.push(user);
  return user;
}

export async function updateUser(id, updates) {
  if (dbReady()) return mongoose.isValidObjectId(id) ? User.findByIdAndUpdate(id, updates, { new: true }) : null;
  const index = memory.users.findIndex((item) => item._id === id);
  if (index < 0) return null;
  memory.users[index] = { ...memory.users[index], ...updates };
  return memory.users[index];
}

export async function getMessages(establishmentId) {
  if (dbReady()) {
    if (!mongoose.isValidObjectId(establishmentId)) return [];
    return (await Message.find({ establishmentId }).sort({ createdAt: 1 }).lean()).map((item) => ({ ...item, _id: String(item._id) }));
  }
  return memory.messages.filter((item) => item.establishmentId === establishmentId);
}

export async function createMessage(input) {
  if (dbReady()) {
    const record = await Message.create(input);
    return { ...record.toObject(), _id: String(record._id) };
  }
  const message = { _id: `message-${randomUUID()}`, createdAt: new Date().toISOString(), deliveredAt: new Date().toISOString(), ...input };
  memory.messages.push(message);
  return message;
}

export async function getNotifications(userId) {
  if (dbReady()) {
    if (!mongoose.isValidObjectId(userId)) return [];
    return (await Notification.find({ userId }).sort({ createdAt: -1 }).limit(20).lean()).map((item) => ({ ...item, _id: String(item._id) }));
  }
  return memory.notifications.filter((item) => item.userId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function createNotification(input) {
  if (dbReady()) {
    const record = await Notification.create(input);
    return { ...record.toObject(), _id: String(record._id) };
  }
  const notice = { _id: `notice-${randomUUID()}`, isRead: false, createdAt: new Date().toISOString(), ...input };
  memory.notifications.unshift(notice);
  return notice;
}

export async function readNotification(id, userId) {
  if (dbReady()) return mongoose.isValidObjectId(id) ? Notification.findOneAndUpdate({ _id: id, userId }, { isRead: true }, { new: true }) : null;
  const notice = memory.notifications.find((item) => item._id === id && item.userId === userId);
  if (notice) notice.isRead = true;
  return notice || null;
}
