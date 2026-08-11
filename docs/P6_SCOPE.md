# P6 Scope and reviewer notes

## High-priority delivery

1. Real-time Socket.IO chat, one room per establishment.
2. Advanced discovery filters: query/category, payment method, distance, open-now, and rating.
3. GCash availability and chat-update notifications as in-app demos only.
4. Owner store submission with address, map coordinates, payment methods, and a storefront image.
5. AI-assisted natural-language filtering with an optional external provider and local fallback.
6. User, owner, and administrator account access; verified-only public listings; admin moderation and CRUD; saved places; and a preferred payment method.

## Technical decisions

- React/Vite frontend and Express/Node backend share one repository but run as independent client and server processes.
- Socket.IO is used for chat rather than polling.
- Multer validates JPG, PNG, and WebP uploads with a 3 MB limit. In production, the image bytes are persisted with the MongoDB establishment record instead of Render's ephemeral filesystem.
- Mongoose schemas persist accounts, listings, moderation audit fields, images, messages, and notifications. A seeded in-memory mode makes the project demonstrable before a database is configured.
- Owner submissions begin as `pending` and inactive. Administrators can verify and publish, reject, or request changes. Public queries return only `verified` and active listings.
- Admin accounts are seeded from server environment variables after MongoDB connects; public registration cannot create an administrator.
- The AI service never completes payments or gives financial advice; it returns only suggested filters that the user chooses to apply.

## Acceptance-demo path

1. Run `npm run dev:full`.
2. On Discover, filter by GCash, distance, open now, or rating.
3. Ask the assistant for a nearby GCash cafe and apply the returned filters.
4. Select a listing, sign in or register, then create a GCash directory notification.
5. Open Messages and send a message; use the reviewer demo reply button to demonstrate a real-time store response and notification.
6. Register as a business owner, submit a store with coordinates and image, and confirm that it does not appear publicly while pending.
7. Use the demo admin account to inspect the protected review queue, request changes or verify the submission, and confirm that a verified listing appears publicly.
8. Edit a verified listing as its owner and confirm that sensitive changes return it to pending review.
