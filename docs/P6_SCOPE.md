# P6 Scope and reviewer notes

## High-priority delivery

1. Real-time Socket.IO chat with a separate, authorized conversation for each consumer and establishment.
2. Advanced discovery filters: query/category, payment method, distance, open-now, and rating.
3. GCash availability and chat-update notifications as in-app demos only.
4. Owner store submission with address, map coordinates, payment methods, and a storefront image.
5. AI-assisted natural-language filtering with an optional external provider and local fallback.
6. User, owner, and administrator account access; verified-only public listings; admin moderation and CRUD; persistent saved places; reviews; stable shareable detail routes; and a preferred payment method.

## Technical decisions

- React/Vite frontend and Express/Node backend share one repository but run as independent client and server processes.
- Socket.IO is used for chat rather than polling. Rooms and history are isolated by establishment and consumer, and owners have a conversation inbox.
- Multer validates JPG, PNG, and WebP uploads with a 3 MB limit. In production, the image bytes are persisted with the MongoDB establishment record instead of Render's ephemeral filesystem.
- Mongoose schemas persist accounts, listings, moderation audit fields, images, reviews, messages, and notifications. A seeded in-memory mode makes the project demonstrable before a database is configured.
- Owner submissions begin as `pending` and inactive. Administrators can verify and publish, reject, or request changes. Public queries return only `verified` and active listings.
- Admin accounts are seeded from server environment variables after MongoDB connects; public registration cannot create an administrator.
- The AI service never completes payments or gives financial advice; it returns only suggested filters that the user chooses to apply.

## Acceptance-demo path

1. Run `npm run dev:full`.
2. On Discover, use live location or set a point on the map, then filter by GCash, distance, open now, or rating.
3. Ask the assistant for a nearby GCash cafe and apply the returned filters.
4. Open a listing's stable detail link, save/share it, and create, edit, then remove a consumer review.
5. Send a message from a consumer account; sign in as the listing owner to reply from the inbox; return to the consumer and open the persistent notification into the exact conversation.
6. Register as a business owner, submit a store with coordinates and image, and confirm that it does not appear publicly while pending.
7. Use a pre-provisioned administrator account, complete its forced first-login password change, inspect the protected review queue, request changes or verify the submission, and confirm that a verified listing appears publicly.
8. Edit every listing field as an administrator. Then edit a verified listing as its owner and confirm that sensitive changes return it to pending review.
