import mongoose from "mongoose";

const { Schema, model, models } = mongoose;

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["user", "admin"], default: "user" },
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
      coordinates: { type: [Number], default: [123.8854, 10.3157] },
    },
    acceptedPaymentMethods: [{ type: String, trim: true }],
    imageUrl: { type: String, default: "" },
    verificationStatus: { type: String, enum: ["verified", "pending"], default: "pending" },
    isActive: { type: Boolean, default: true },
    openNow: { type: Boolean, default: true },
    rating: { type: Number, min: 0, max: 5, default: 4.5 },
    reviewCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);
establishmentSchema.index({ location: "2dsphere" });

const messageSchema = new Schema(
  {
    establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment", required: true },
    senderUserId: { type: Schema.Types.ObjectId, ref: "User" },
    senderName: { type: String, required: true },
    senderRole: { type: String, enum: ["user", "establishment"], default: "user" },
    body: { type: String, required: true, trim: true, maxlength: 500 },
    deliveredAt: { type: Date, default: Date.now },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    establishmentId: { type: Schema.Types.ObjectId, ref: "Establishment" },
    type: { type: String, enum: ["gcash", "chat"], required: true },
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
