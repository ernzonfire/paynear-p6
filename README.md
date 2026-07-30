# PayNear - P6 Full-Stack Project

PayNear helps people find nearby establishments based on accepted payment methods. It is a MERN-style group project for **The Last Room**: Jerald Tamayo, Brian Butche, John Angelo Bitana, and Ernie Demaluan.

The repository is deliberately separate from the P4 KusinaMate project.

## What is included

- Facebook Marketplace-style nearby discovery: list or map view, payment-branded pins, a browser-location radius circle, plus place/category, distance, open-now, and rating filters.
- Recognizable e-wallet and bank identifiers for GCash, Maya, BPI, BDO, UnionBank, cards, cash, and bank transfers; GCash notifications remain **demo-only** directory updates.
- JWT registration and sign-in, saved places, and preferred payment method.
- Socket.IO real-time Messenger-style establishment chat.
- Admin-only establishment creation, verification, deactivation, and JPG/PNG/WebP image upload.
- AI Place Assistant that turns a natural-language request into reviewable search filters. It has a safe local fallback and can call OpenAI when configured.
- Express/Mongoose models for users, establishments, chat messages, and notifications. The API runs in usable in-memory demo mode until MongoDB is connected.

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm install --prefix server
cp .env.example .env
cp server/.env.example server/.env
npm run dev:full
```

Open [http://localhost:5173](http://localhost:5173). The API is at `http://localhost:4000/api`.

Use the **Use demo admin account** button to sign in as:

```text
email: admin@paynear.demo
password: admin123
```

This account exists only in the local demo store. Change or remove it before deployment.

## Database and AI setup

The backend starts in `demo` mode with sample Cebu locations when `MONGODB_URI` is blank. Add a MongoDB connection string in `server/.env` for persistent data. The Mongoose schemas include a GeoJSON location field and 2dsphere index for production geospatial queries.

To enable the external AI provider, set both values in `server/.env`:

```text
OPENAI_API_KEY=your_key
OPENAI_MODEL=your_compatible_model_name
```

Without them, the assistant still works using local intent parsing for categories, payment methods, distance, and open-now language. The AI assistant only suggests directory filters. It must not give payment or financial advice.

## Important scope boundary

PayNear does **not** integrate with GCash, Maya, BPI, BDO, or UnionBank; it does not move money, store payment credentials, or verify a payment. Their wordmarks appear only as payment-method identifiers so users can see what a listing reports it accepts. PayNear is not sponsored by or affiliated with those brands.

## Scripts

```bash
npm run dev         # Vite client
npm run server      # Express + Socket.IO API with nodemon
npm run dev:full    # client and API together
npm run build       # production client build
npm run test        # lint + Node API unit tests
```

## Main API routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API health and active data mode |
| POST | `/api/auth/register`, `/api/auth/login` | Account access |
| GET | `/api/establishments` | Advanced discovery filters |
| POST/PUT | `/api/establishments` | Admin listing management |
| POST | `/api/establishments/:id/image` | Admin image upload |
| POST | `/api/ai/suggest` | AI-assisted filter suggestion |
| GET | `/api/messages/:establishmentId` | Protected chat history |
| GET/PATCH | `/api/notifications` | In-app notices and read state |

## Trello

Project board: [PayNear workflow](https://trello.com/b/6a34f3da0f1db896cc034cdd)

## Suggested deployment

- Frontend: Vercel or Netlify, with `VITE_API_URL` set to the public API URL.
- Backend: Render, Railway, or a Node-capable host, with `CLIENT_URL`, `JWT_SECRET`, `MONGODB_URI`, and optional AI variables set there.
- MongoDB: MongoDB Atlas, with the database network access configured for the backend host.
