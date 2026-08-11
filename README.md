# PayNear - P6 Full-Stack Project

PayNear helps people find nearby establishments based on accepted payment methods. It is a MERN-style group project for **The Last Room**: Jerald Tamayo, Brian Butche, John Angelo Bitana, and Ernie Demaluan.

The repository is deliberately separate from the P4 KusinaMate project.

The current approved scope is documented in [`output/pdf/PayNear_Project_Proposal_Revised_Owner_Workflow.pdf`](output/pdf/PayNear_Project_Proposal_Revised_Owner_Workflow.pdf). Regenerate it after proposal edits with `python3 scripts/generate_revised_proposal.py`.

## What is included

- Facebook Marketplace-style nearby discovery: list or map view, payment-branded pins, a browser-location radius circle, plus place/category, distance, open-now, and rating filters.
- Recognizable e-wallet and bank identifiers for GCash, Maya, BPI, BDO, UnionBank, cards, cash, and bank transfers.
- JWT registration and sign-in, saved places, and preferred payment method.
- Socket.IO real-time Messenger-style establishment chat.
- Business-owner registration and private store submission with address, map coordinates, payment methods, and a JPG/PNG/WebP storefront image.
- A protected administrator review queue for verifying, rejecting, requesting changes, publishing, and deactivating listings.
- AI Place Assistant that turns a natural-language request into reviewable search filters. It has a safe local fallback and can call OpenAI when configured.
- Express/Mongoose models for users, establishments, moderation audit fields, persistent store images, chat messages, and notifications. The API can use a non-persistent in-memory development store until MongoDB is connected.

Only establishments with both `verificationStatus: "verified"` and `isActive: true` are returned by the public API. Owner submissions and owner edits to verified business details return the listing to the private administrator review queue.

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

Sign-in always requires manual email and password entry. Users and business owners can create their own accounts. Administrator registration is not public: configure the private team accounts through `ADMIN_ACCOUNTS_JSON` after connecting MongoDB. The server securely seeds only missing administrators with one-time temporary passwords. On first sign-in, an administrator is restricted to the password-change screen and cannot use the dashboard, protected APIs, notifications, or chat until setting a private password of at least 12 characters.

## Database and AI setup

The backend starts in in-memory development mode with sample Philippine locations and mock listing contacts when `MONGODB_URI` is blank. Add a MongoDB connection string in `server/.env` for persistent accounts, submissions, review history, messages, notifications, and uploaded store images. The Mongoose schemas include a GeoJSON location field and 2dsphere index for production geospatial queries.

Provision the PayNear team administrators only through a private server environment variable:

```text
ADMIN_ACCOUNTS_JSON=[{"name":"Admin One","email":"admin.one@example.com","password":"use-a-strong-temporary-password"},{"name":"Admin Two","email":"admin.two@example.com","password":"use-another-temporary-password"}]
```

Do not expose this value in React, Vercel client variables, screenshots, or Git.

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
| POST/PUT | `/api/establishments` | Owner/admin listing submission and permitted updates |
| POST | `/api/establishments/:id/image` | Owner/admin image upload |
| GET | `/api/owner/establishments` | Owner's private submissions |
| GET | `/api/admin/establishments` | Protected administrator review queue |
| PATCH | `/api/admin/establishments/:id/review` | Verify, reject, or request changes |
| POST | `/api/ai/suggest` | AI-assisted filter suggestion |
| GET | `/api/messages/:establishmentId` | Protected chat history |
| GET/PATCH | `/api/notifications` | In-app notices and read state |

## Trello

Project board: [PayNear workflow](https://trello.com/b/6a34f3da0f1db896cc034cdd)

## Suggested deployment

- Frontend: Vercel or Netlify, with `VITE_API_URL` set to the public API URL.
- Backend: Render, Railway, or a Node-capable host, with `CLIENT_URL`, `PUBLIC_API_URL`, `JWT_SECRET`, `MONGODB_URI`, `ADMIN_ACCOUNTS_JSON`, and optional AI variables set there.
- MongoDB: MongoDB Atlas, with the database network access configured for the backend host.
