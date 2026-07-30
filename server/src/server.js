import http from "node:http";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { Server } from "socket.io";
import { attachSocketServer, createApp } from "./app.js";

dotenv.config();

const port = Number(process.env.PORT || 4000);
const { app, jwtSecret } = createApp();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || "http://localhost:5173", methods: ["GET", "POST"] },
});

attachSocketServer(io, jwtSecret);

async function start() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      console.log("Connected to MongoDB.");
    } catch (error) {
      console.warn("MongoDB connection failed; starting in demo mode.", error.message);
    }
  } else {
    console.log("Starting in demo mode. Add MONGODB_URI to enable persistent data.");
  }

  server.listen(port, () => console.log(`PayNear API listening on http://localhost:${port}`));
}

start();
