# Cloud Storage SaaS — Backend

A cloud-based file storage service backend, similar in spirit to Google Drive. Built as a first internship project, this API handles authentication, file/folder management with versioning, sharing and permissions, full-text search, and more — all backed by PostgreSQL via Supabase.

**Live API:** https://cloud-storage-saa-s-backend.vercel.app
**Health check:** https://cloud-storage-saa-s-backend.vercel.app/health

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Language | TypeScript |
| Database | PostgreSQL (via [Supabase](https://supabase.com)) |
| File Storage | Supabase Storage |
| Auth | JWT (httpOnly cookies) + Google OAuth |
| Password Hashing | bcrypt |
| Testing | Jest + Supertest |
| Deployment | Vercel (serverless) |

---

## Features

### 🔐 Authentication & Security
- Email/password signup and login with bcrypt password hashing
- Google OAuth sign-in
- JWT sessions stored in httpOnly, secure cookies
- Auth middleware protecting all sensitive routes
- Role-based permission enforcement (Owner / Editor / Viewer) on every mutation endpoint

### ☁️ File Storage & Management
- File upload via Supabase Storage (private bucket), handled through multer
- Automatic file versioning — every upload creates a new tracked version
- SHA-256 checksums computed per file for integrity verification
- Full CRUD for files & folders: create, rename, soft-delete, restore
- Nested folder hierarchy of unlimited depth (self-referencing parent-child structure)
- Cascading soft-delete — trashing a folder recursively trashes everything inside it
- Dedicated Trash view for soft-deleted items
- Permanent delete — removes both the database record and the underlying storage object

### 🔗 Sharing & Permissions
- Per-user sharing with Viewer/Editor roles
- Public shareable links with configurable expiry and optional password protection
- Signed, time-limited URLs (5-minute windows) for secure file delivery
- Share links automatically blocked if the underlying file has been trashed
- Separate direct-download endpoint for authenticated owners/collaborators

### 🔍 Search & Performance
- PostgreSQL full-text search (GIN-indexed), with filename normalization so tokens like `_`, `-`, and `.` are searchable as separate words
- Sorting by name, size, or creation date
- Pagination on every list-returning endpoint (search, folder contents, trash) — folders and files paginated independently
- Composite database indexes for common query patterns (owner + deletion status)

### ✅ Quality & Deployment
- 29 automated tests (Jest + Supertest) covering auth, files, folders, sharing, search, and permission edge cases
- Deployed on Vercel as serverless functions
- Environment-based configuration — secrets never committed to source control

---

## Database Schema

8 core tables, all in PostgreSQL:

- **users** — id, email, name, image_url, password_hash, auth_provider, provider_id
- **folders** — id, name, owner_id, parent_id (self-referencing), is_deleted
- **files** — id, name, mime_type, size_bytes, storage_key, owner_id, folder_id, version_id, checksum, is_deleted
- **file_versions** — id, file_id, version_number, storage_key, size_bytes, checksum
- **shares** — per-user ACL: resource_type, resource_id, grantee_user_id, role
- **link_shares** — public links: token, resource_type, resource_id, role, password_hash, expires_at
- **stars** — user favorites: user_id, resource_type, resource_id
- **activities** — audit log: actor_id, action, resource_type, resource_id, context (jsonb)

---

## API Endpoints

### Auth (`/api/auth`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/signup` | Create a new account (email/password) |
| POST | `/login` | Log in, sets auth cookie |
| POST | `/logout` | Clear auth cookie |
| POST | `/google` | Sign in with Google OAuth |
| GET | `/me` | Get current authenticated user |

### Files (`/api/files`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/upload` | Upload a file (multipart/form-data) |
| PATCH | `/:id/rename` | Rename a file |
| DELETE | `/:id` | Soft-delete (trash) a file |
| PATCH | `/:id/restore` | Restore a file from trash |
| DELETE | `/:id/permanent` | Permanently delete a file |
| GET | `/:id/download-url` | Get a signed download URL |
| GET | `/trash` | List trashed files and folders |

### Folders (`/api/folders`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/` | Create a folder |
| GET | `/:id` | List folder contents (`root` for top-level) |
| PATCH | `/:id/rename` | Rename a folder |
| DELETE | `/:id` | Soft-delete a folder (cascades to contents) |
| PATCH | `/:id/restore` | Restore a folder |

### Sharing (`/api/shares`)
| Method | Endpoint | Description |
|---|---|---|
| POST | `/user` | Share a file/folder with a specific user |
| DELETE | `/user/:id` | Revoke a user's access |
| POST | `/link` | Create a public share link |
| POST | `/link/:token` | Open a share link (returns a signed URL) |

### Search (`/api/search`)
| Method | Endpoint | Description |
|---|---|---|
| GET | `/?q=&sort=&order=&page=&limit=` | Full-text search across owned files |

---

## Getting Started

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier works)
- A [Google Cloud](https://console.cloud.google.com) OAuth client (for Google sign-in)

### Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/tanzeem-source/Cloud-storage-SaaS-backend-.git
   cd Cloud-storage-SaaS-backend-/server
   npm install
   ```

2. Create a `.env` file in `server/`:
   ```
   SUPABASE_URL=your-supabase-project-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   JWT_SECRET=your-random-secret
   GOOGLE_CLIENT_ID=your-google-oauth-client-id
   FRONTEND_URL=http://localhost:3000
   PORT=5000
   ```

3. Run the schema SQL (found in `/sql` or the project docs) in your Supabase SQL Editor to create all tables.

4. Create a private Supabase Storage bucket named `user-files`.

5. Start the dev server:
   ```bash
   npm run dev
   ```

6. Confirm it's working:
   ```
   GET http://localhost:5000/health
   → { "ok": true, "dbError": null }
   ```

### Running Tests
```bash
npm test
```

### Building for Production
```bash
npm run build
npm start
```

---

## Deployment

This backend is deployed on **Vercel** as serverless functions. The `server/` directory is set as the project's root directory, with `vercel.json` routing all requests to the Express app entry point.

To deploy your own copy:
1. Import the repo into Vercel
2. Set the Root Directory to `server`
3. Add all environment variables listed above
4. Deploy

---

## Project Status

Backend (Days 1–7) complete: schema, auth, file storage, CRUD, sharing/permissions, search, testing, and deployment. A Next.js frontend is planned next.

---

## License

This is a personal learning/internship project. No license specified yet.
