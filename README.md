# Percona Release Notes Search

Demo app for **Percona Vector Search for MongoDB** (mongot). Upload Percona product release notes in Markdown format and search them with natural language powered by the Atlas-compatible `$search` aggregation stage.

## Architecture

```
┌──────────────────────┐   nginx :8080   ┌──────────────────────────────┐
│  Angular 22 (SPA)    │  ─────────────► │  Express API  (server/)      │
│  Search + Upload UI  │  /api/* proxied │  POST /api/upload            │
└──────────────────────┘                 │  POST /api/search ◄─ mongot  │
                                         │  GET  /api/documents         │
                                         └──────────┬───────────────────┘
                                                    │ mongodb driver
                                         ┌──────────▼───────────────────┐
                                         │  mongod :27017               │
                                         │    └─ searchIndexMgmt ──►    │
                                         │  mongot :27027               │
                                         └──────────────────────────────┘
```

## Running with Docker Compose

Two compose files are provided — pick the stack you want to run.

### Community stack (MongoDB Community + mongot)

**One-time setup:**

```bash
# 1. Password file — mongot requires owner-readable only (0600)
cp pwfile.example pwfile && chmod 600 pwfile

# 2. Keyfile — required by MongoDB for intra-replica-set auth (0400)
openssl rand -base64 756 > keyfile && chmod 400 keyfile
```

```bash
docker compose -f docker-compose.community.yml up -d --build
```

| Service | Image | Port |
|---|---|---|
| `mongodb-community` | `mongodb/mongodb-community-server:latest` | 27017 |
| `mongodb-community-search` | `mongodb/mongodb-community-search:latest` | 27027 |
| `api` | built from `server/` | 3000 (internal) |
| `app` | built from project root | **8080** |

### Percona stack (Percona Server for MongoDB 8.3 + Percona mongot)

> **Before running:** open [`docker-compose.percona.yml`](docker-compose.percona.yml) and replace the mongot image placeholder:
>
> ```yaml
> # find this line and update it:
> image: PLACEHOLDER_REGISTRY/PLACEHOLDER_IMAGE:PLACEHOLDER_TAG
> ```

```bash
docker compose -f docker-compose.percona.yml up -d --build
```

| Service | Image | Port |
|---|---|---|
| `percona-mongod` | `percona/percona-server-mongodb:8.3` | 27017 |
| `percona-mongot` | *(placeholder — update before running)* | 27027 |
| `api` | built from `server/` | 3000 (internal) |
| `app` | built from project root | **8080** |

### Open the app

```
http://localhost:8080
```

### Useful commands

```bash
# Tail logs for all services
docker compose -f docker-compose.community.yml logs -f

# Tail logs for a single service
docker compose -f docker-compose.community.yml logs -f api

# Stop and remove containers (keeps volumes)
docker compose -f docker-compose.community.yml down

# Stop and remove containers AND volumes (full reset)
docker compose -f docker-compose.community.yml down -v

# Open a mongosh session against the community stack
docker exec -it percona-rn-search-mongod-community \
  mongosh -u root -p password --authenticationDatabase admin
```

### Create the search index

Run this once after the stack is up — mongot needs an index definition before `$search` queries work:

```js
use release_notes

db.documents.createSearchIndex({
  name: "default",
  definition: {
    mappings: {
      dynamic: false,
      fields: {
        content:                    [{ type: "string" }],
        releaseHighlights:          [{ type: "string" }],
        "newFeatures.description":  [{ type: "string" }],
        "improvements.description": [{ type: "string" }],
        "bugFixes.description":     [{ type: "string" }],
        product:                    [{ type: "string" }],
        version:                    [{ type: "string" }],
      }
    }
  }
})
```

> If the index is not yet created, the API falls back to `$text` search, then to a regex scan, so the app remains functional while the index is being built.

---

## Running locally (without Docker)

### 1. Backend

```bash
cd server
cp .env.example .env     # set MONGODB_URI to point at your mongod instance
npm install
npm run dev              # http://localhost:3000
```

**Environment variables:**

| Variable | Default | Description |
|---|---|---|
| `MONGODB_URI` | *(required)* | `mongodb://…` URI for Percona Server for MongoDB |
| `MONGODB_DB` | `release_notes` | Database name |
| `MONGODB_COLLECTION` | `documents` | Collection name |
| `PORT` | `3000` | HTTP port |

### 2. Frontend

```bash
npm install
npm start                # http://localhost:4200
```

> **Node.js ≥ 24.15.0** is required by Angular CLI 22.

The dev server proxies `/api/*` to `http://localhost:3000` automatically via the `environment.development.ts` `apiUrl`.

---

## Usage

1. **Upload** — go to `/upload`, drag & drop one or more `.md` release notes files.  
   Filename convention: `<version>.md` (e.g. `7.0.18-11.md`).  
   The product name is auto-detected from the H1 heading.

2. **Search** — go to `/search` and type a natural language query, for example:
   - *"bug fix to LDAP"*
   - *"Google Workload Federation"*
   - *"audit log improvements in 7.0"*

   Filter by product using the dropdown. Results are ranked by mongot relevance score.

---

## Supported products

- Percona Server for MongoDB
- Percona Backup for MongoDB
- Percona Operator for MongoDB
- Percona ClusterSync for MongoDB
