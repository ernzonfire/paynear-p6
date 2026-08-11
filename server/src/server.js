import http from "node:http";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { attachSocketServer, createApp } from "./app.js";
import { createUser, findUserByEmail } from "./demoStore.js";

dotenv.config();

const port = Number(process.env.PORT || 4000);
const { app, jwtSecret } = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || "http://localhost:5173", methods: ["GET", "POST"] },
});

attachSocketServer(io, jwtSecret);

async function ensureAdminAccount() {
  const email = String(process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!email || password.length < 12) {
    console.warn("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters to seed the production administrator.");
    return;
  }
  const existing = await findUserByEmail(email);
  if (existing) {
    if (existing.role !== "admin") console.warn(`ADMIN_EMAIL ${email} already belongs to a non-admin account; no role was changed.`);
    return;
  }
  await createUser({
    name: String(process.env.ADMIN_NAME || "PayNear Admin").trim(),
    email,
    passwordHash: await bcrypt.hash(password, 12),
    role: "admin",
  });
  console.log(`Created production administrator ${email}.`);
}

async function start() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("Connected to MongoDB.");
      await ensureAdminAccount();
    } catch (error) {
      console.warn("MongoDB connection failed; starting in demo mode.", error.message);
    }
  } else {
    console.log("Starting in demo mode. Add MONGODB_URI to enable persistent data.");
  }

  server.listen(port, "0.0.0.0", () => console.log(`PayNear API listening on port ${port}.`));
}

start();
