# P6 Scope and reviewer notes

## High-priority delivery

1. Real-time Socket.IO chat, one room per establishment.
2. Advanced discovery filters: query/category, payment method, distance, open-now, and rating.
3. GCash availability and chat-update notifications as in-app demos only.
4. Admin image upload for store or landmark recognition.
5. AI-assisted natural-language filtering with an optional external provider and local fallback.
6. Account access, verified listings, admin CRUD, saved places, and a preferred payment method.

## Technical decisions

- React/Vite frontend and Express/Node backend share one repository but run as independent client and server processes.
- Socket.IO is used for chat rather than polling.
- Multer validates JPG, PNG, and WebP uploads with a 3 MB limit.
- Mongoose schemas are supplied for MongoDB persistence. A seeded in-memory mode makes the project demonstrable before a database is configured.
- The AI service never completes payments or gives financial advice; it returns only suggested filters that the user chooses to apply.

## Acceptance-demo path

1. Run `npm run dev:full`.
2. On Discover, filter by GCash, distance, open now, or rating.
3. Ask the assistant for a nearby GCash cafe and apply the returned filters.
4. Select a listing, sign in or register, then create a GCash directory notification.
5. Open Messages and send a message; use the reviewer demo reply button to demonstrate a real-time store response and notification.
6. Use the demo admin account to create, verify, deactivate, and upload an image to a listing.
