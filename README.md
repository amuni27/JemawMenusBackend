# QR Menu SaaS – Backend

Production-ready multi-tenant QR Menu API built with **Node.js, TypeScript, Express, Prisma & PostgreSQL**.

---

## Requirements

• **Node.js** ≥ 18.x  
• **PostgreSQL** ≥ 13 (database user must have permission to create schemas / tables)

---

## Environment Variables

Create a `.env` file in the project root (or copy `.env.example`).

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/qrmenu?schema=public"
JWT_SECRET="supersecretjwt"
PORT=3000
# Used when vendor has no customDomain → https://<vendorSlug>.<BASE_DOMAIN>/menu/{menuId}
BASE_DOMAIN="yourdomain.com"
```

---

## Installation & First Run

```bash
# Install dependencies
npm install

# Apply DB schema & generate client
npm run prisma:migrate

# Seed system tables (Breakfast/Lunch/Dinner/Drinks)
npm run prisma:seed

# Start dev server with ts-node-dev (hot reload)
npm run dev
```

---

## NPM Scripts

| Script | Purpose |
|--------|---------|
| `dev` | Run TypeScript server with hot-reload |
| `build` | Compile TypeScript → `dist/` |
| `start` | Run compiled JS from `dist/` |
| `prisma:migrate` | Run `prisma migrate dev` (creates / updates DB & generates client) |
| `prisma:seed` | Execute seed script (menu_types) |
| `prisma:generate` | Regenerate Prisma client |

---

## API Overview

Base URL: `http://localhost:PORT/api`

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/register` | Create vendor + owner user (returns JWT) |
| POST | `/auth/login` | Email/password → JWT |
| GET | `/auth/me` | Current user profile |

### Vendor Profile

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vendor/me` | Vendor info |
| PATCH | `/vendor/me` | Update businessName / phone / customDomain |
| GET | `/vendor/me/address` | Get address |
| PATCH | `/vendor/me/address` | Upsert address |
| GET | `/vendor/me/open-hours` | Weekly open hours |
| PUT | `/vendor/me/open-hours` | Bulk update 7-day schedule |

### Menus

| Method | Path | Description |
|--------|------|-------------|
| GET | `/menus` | List vendor menus |
| POST | `/menus` | Create menu |
| GET | `/menus/:menuId` | Get menu |
| PATCH | `/menus/:menuId` | Update menu |
| DELETE | `/menus/:menuId` | Delete menu (cascades) |

### Categories

| Method | Path | Description |
|--------|------|-------------|
| GET | `/menus/:menuId/categories` | List categories |
| POST | `/menus/:menuId/categories` | Create category |
| PATCH | `/categories/:categoryId` | Update |
| DELETE | `/categories/:categoryId` | Delete (blocked if items exist) |
| POST | `/menus/:menuId/categories/reorder` | Reorder categories (orderedIds[]) |

### Menu Items

| Method | Path | Description |
|--------|------|-------------|
| GET | `/menus/:menuId/items` | List items (filters: categoryId, status, search) |
| POST | `/menus/:menuId/items` | Create item |
| GET | `/items/:itemId` | Get item |
| PATCH | `/items/:itemId` | Update item |
| PATCH | `/items/:itemId/status` | Update status only |
| DELETE | `/items/:itemId` | Delete item |

### QR Tables

| Method | Path | Description |
|--------|------|-------------|
| GET | `/menus/:menuId/qr-tables` | List QR tables |
| POST | `/menus/:menuId/qr-tables` | Create QR table (auto code) |
| PATCH | `/qr-tables/:qrId` | Update label / isActive |
| DELETE | `/qr-tables/:qrId` | Delete |

### Public Resolver

| Method | Path | Description |
|--------|------|-------------|
| GET | `/q/:code` | Resolve code → JSON (or `302` if `?redirect=1`) |

Response JSON:
```json
{
  "menuId": "uuid",
  "vendorSlug": "hotel-plaza",
  "customDomain": "menu.myhotel.com",
  "targetUrl": "https://hotel-plaza.yourdomain.com/menu/<menuId>?t=<code>",
  "label": "Table 1"
}
```

---

## Sample cURL Requests

### Register & Login

```bash
# Register vendor + owner
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "businessName":"Hotel Plaza",
    "businessPhone":"+123456",
    "type":"HOTEL",
    "email":"owner@plaza.com",
    "username":"owner1",
    "fullName":"Owner Name",
    "password":"secret123"
  }'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@plaza.com","password":"secret123"}'
# => {"token":"<JWT>"}
```

### Create Menu → Category → Item

```bash
TOKEN=<JWT>

# Create menu
MENU=$(curl -s -X POST http://localhost:3000/api/menus \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"menuTypeId":"<breakfast_uuid>","name":"Breakfast"}')
MENU_ID=$(echo $MENU | jq -r '.id')

# Create category
CAT=$(curl -s -X POST http://localhost:3000/api/menus/$MENU_ID/categories \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Main"}')
CAT_ID=$(echo $CAT | jq -r '.id')

# Create item
curl -X POST http://localhost:3000/api/menus/$MENU_ID/items \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "name":"Pancakes",
    "price":5.99,
    "categoryId":"'$CAT_ID'",
    "ingredients":["Flour","Eggs","Milk"]
  }'
```

### Create QR Table & Resolve

```bash
# Create QR table
QR=$(curl -s -X POST http://localhost:3000/api/menus/$MENU_ID/qr-tables \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"label":"Table 1"}')
CODE=$(echo $QR | jq -r '.code')

# Resolve (JSON)
curl http://localhost:3000/api/q/$CODE

# Resolve & redirect
curl -I http://localhost:3000/api/q/$CODE?redirect=1
```

---

## Ownership & Validation Rules

1. **Ownership** – Except for `vendors`, all authorization is derived from `req.user.vendorId`.
   * For entities without `vendorId` (categories, items, qr_tables) the API joins through their parent `menu` → `menus.vendorId`.
2. **Validation** – All request bodies/queries are validated with **zod**.
   * `ingredients[]` required ≥1, trimmed & case-insensitive unique.
   * `price`, `calories`, etc. must be non-negative.
3. **sortOrder** – Auto-assigned per category when creating items; categories can be reordered via endpoint.
4. **QR Codes** – Short unique tokens (8+ chars, alphanumeric no confusing chars). 5 attempts made on collision.
5. **Public Resolver** – Returns 404 if QR inactive or menu inactive.

---

Happy hacking! 🎉
