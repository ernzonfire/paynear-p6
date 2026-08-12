import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "owner", "admin"], default: "user" },
    mustChangePassword: { type: Boolean, default: false },
    sessionVersion: { type: Number, min: 0, default: 0 },
    preferredPaymentMethod: { type: String, default: "GCash" },
    favoriteEstablishmentIds: [{ type: Schema.Types.ObjectId, ref: "Establishment" }],
  },
  { timestamps: true },
);

const establishmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    category: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [121.049, 14.64] },
    },
    acceptedPaymentMethods: [{ type: String, trim: true }],
    ownerName: { type: String, trim: true, default: "Unassigned owner" },
    ownerTitle: { type: String, trim: true, default: "Listing contact" },
    ownerUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    imageUrl: { type: String, default: "" },
    imageData: { type: Buffer, select: false },
    imageContentType: { type: String, select: false },
    verificationStatus: {
      type: String,
      enum: ["pending", "changes_requested", "verified", "rejected"],
      default: "pending",
      index: true,
    },
    isActive: { type: Boolean, default: false, index: true },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewedByUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    reviewNotes: { type: String, trim: true, maxlength: 500, default: "" },
    publishedAt: { type: Date, default: null },
    openNow: { type: Boolean, default: true },
    rating: { type: Number, min: 0, max: 5, default: 0 },
    reviewCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);
establishmentSchema.index({ location: "2dsphere" });

const messageSchema = new Schema(
  {
    establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true },
    conversationUserId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: "User" },
    senderName: { type: String, required: true },
    senderRole: { type: String, enum: ["user", "establishment"], default: "user" },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    deliveredAt: { type: Date, default: Date.now },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);
messageSchema.index({ establishmentId: 1, conversationUserId: 1, createdAt: 1 });

const reviewSchema = new Schema(
  {
    establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    userName: { type: String, required: true, trim: true, maxlength: 80 },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, maxlength: 700 },
  },
  { timestamps: true },
);
reviewSchema.index({ establishmentId: 1, userId: 1 }, { unique: true });

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment" },
    conversationUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    type: { type: String, enum: ["gcash", "chat", "listing"], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const User = models.User || model("User", userSchema);
export const Establishment = models.Establishment || model("Establishment", establishmentSchema);
export const Message = models.Message || model("Message", messageSchema);
export const Notification = models.Notification || model("Notification", notificationSchema);
export const Review = models.Review || model("Review", reviewSchema);
