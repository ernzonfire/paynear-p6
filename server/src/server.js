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

function configuredAdminAccounts() {
  if (process.env.ADMIN_ACCOUNTS_JSON) {
    try {
      const accounts = JSON.parse(process.env.ADMIN_ACCOUNTS_JSON);
      if (!Array.isArray(accounts)) throw new Error("the value must be a JSON array");
      return accounts;
    } catch (error) {
      console.warn(`ADMIN_ACCOUNTS_JSON is invalid: ${error.message}.`);
      return [];
    }
  }

  if (!process.env.ADMIN_EMAIL && !process.env.ADMIN_PASSWORD) return [];
  return [{
    name: process.env.ADMIN_NAME || "PayNear Admin",
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  }];
}

async function ensureAdminAccounts() {
  const accounts = configuredAdminAccounts();
  if (accounts.length === 0) {
    console.warn("Set ADMIN_ACCOUNTS_JSON to provision the private PayNear administrator accounts.");
    return;
  }

  for (const account of accounts.slice(0, 10)) {
    const name = String(account.name || "PayNear Admin").trim();
    const email = String(account.email || "").toLowerCase().trim();
    const password = String(account.password || "");
    if (!email.includes("@") || password.length < 12) {
      console.warn("Skipped an invalid administrator entry. Each entry needs a valid email and a password of at least 12 characters.");
      continue;
    }
    const existing = await findUserByEmail(email);
    if (existing) {
      if (existing.role !== "admin") console.warn(`Administrator email ${email} already belongs to a non-admin account; no role was changed.`);
      continue;
    }
    await createUser({
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: "admin",
      mustChangePassword: true,
      sessionVersion: 0,
    });
    console.log(`Created production administrator ${email} with a required first-login password change.`);
  }
}

async function start() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("Connected to MongoDB.");
      await ensureAdminAccounts();
    } catch (error) {
      console.warn("MongoDB connection failed; starting in non-persistent memory mode.", error.message);
    }
  } else {
    console.log("Starting in non-persistent memory mode. Add MONGODB_URI before production use.");
  }

  server.listen(port, "0.0.0.0", () => console.log(`PayNear API listening on port ${port}.`));
}

start();
