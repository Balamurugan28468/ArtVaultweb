# ArtVault V1.0 — Free-Plan Backup and Recovery Runbook

**Target Architecture:** Supabase Hosted Free Tier  
**Safety Classification:** Strictly Read-Only for Production; Local/Isolated Staging for Drills  
**Author:** ArtVault Autonomous Release Engineering  
**Date:** October 2026  

---

## 1. Executive Summary & Tooling Assessment

### 1.1 Supabase Free Plan Reality
On the Supabase Free Plan:
- **Automated daily backups and Point-In-Time Recovery (PITR) are NOT available.**
- Quota alerts or project pausing risk service interruption if manual backups are not maintained.
- **You are 100% responsible for disaster recovery backups.**
- Backing up consists of two separate domains:
  1. **PostgreSQL Relational State:** Roles, schema DDL, table data, Auth accounts, and cron schedules.
  2. **Supabase Storage Binary State:** Artwork images, thumbnails, avatars, and 3D assets stored in Storage buckets.

### 1.2 Local Tooling Feasibility on Current Host
An audit of the Windows development environment revealed:
- `Docker Desktop`: Installed but service is stopped (`com.docker.service`). WSL2 engine is not configured.
- `pg_dump.exe` / `psql.exe`: Not present in host system `PATH`.
- `npx supabase db dump`: Requires either a running Docker daemon (default containerized mode) or native `pg_dump` binaries installed locally.

**Immediate Practical Solution for Free Dumps:**
1. **Option A (Recommended for Windows - Native Postgres Client Tools):**  
   Download portable PostgreSQL command-line binaries (e.g. from EnterpriseDB) or use the `pg_dump.exe` bundled inside **DBeaver** or **pgAdmin 4** installed on Windows.
2. **Option B (Docker Desktop):**  
   Start Docker Desktop. Once running, `npx supabase db dump` operates out of the box using Supabase's official PostgreSQL container.
3. **Option C (Lightweight Node.js Exporter):**  
   A zero-installation script utilizing the existing `@supabase/supabase-js` or `pg` driver to extract table data to JSON/SQL files.

---

## 2. PostgreSQL Schema & Data Backup Strategy

### 2.1 Distinction Between DDL (Schema) and DML (Data)
- **Schema DDL (Structure):**  
  Already fully version-controlled in the repository:
  - 18 applied migrations (`supabase/migrations/`)
  - 3 pending release migrations (`20261020153833_auction_e2e_lifecycle.sql`, `20261023142417_weekly_artwork_selection.sql`, `20261023154024_assistant_recommendations.sql`).
  - No database dump is required to recreate the schema; applying migrations creates an identical structure.
- **Roles, Policies, Functions, & Triggers:**  
  All Row-Level Security (RLS) policies, database triggers, constraints, and custom functions are defined in the migration files.
- **Application Data (DML):**  
  Must be extracted directly from the live database. Key schemas to back up:
  - `public`: Core tables (`profiles`, `artworks`, `auctions`, `bids`, `orders`, `transactions`, `reviews`, `favorites`).
  - `auth`: `auth.users`, `auth.identities` (contains user emails, encrypted password hashes, metadata).
  - `cron`: Scheduled job definitions (`cron.job`, `cron.job_run_details`).
  - `supabase_migrations`: Applied migration history (`schema_migrations`).

---

## 3. Storage Objects Backup Strategy

### 3.1 Metadata vs. Binary Payloads
- **Metadata:** Bucket configurations and file paths are stored in the `storage.buckets` and `storage.objects` PostgreSQL tables. A database dump captures this metadata, but **zero file bytes**.
- **Binary Payloads (Images / 3D models):** Reside in Supabase Storage S3 buckets (`artworks`, `avatars`, `certificates`). These must be downloaded recursively using the Supabase Storage REST API or CLI.

---

## 4. What CANNOT Be Backed Up on the Free Plan

| Item | Status | Mitigation / Workaround |
| :--- | :--- | :--- |
| **PITR / WAL Archives** | ❌ Unavailable on Free Tier | Regular manual logical dumps before any migration. |
| **Auth JWT Secret** | ⚠️ Managed by Supabase platform | Document your JWT secret securely from Project Settings > API. |
| **Custom Email SMTP Config** | ❌ Not in SQL dump | Document SMTP host, port, and user in secure password manager. |
| **Dashboard Log History** | ❌ Kept only 1 day on Free Tier | Log drains are Pro-only. Export incident logs manually if needed. |
| **Realtime Connection History**| ❌ Ephemeral memory | Stateless by design; no backup needed. |

---

## 5. Master Step-by-Step Execution Runbook

All commands are strictly labeled:
- `[LOCAL-ONLY]`: Executes strictly on your local PC. No network calls or cloud changes.
- `[REMOTE READ-ONLY]`: Reads data from Supabase hosted cloud without altering any data.
- `[REMOTE-MUTATING]`: Writes to or modifies a database or bucket (used ONLY on staging drill project).

---

### Phase A: Local Preparation & Directory Setup `[LOCAL-ONLY]`

Create the backup storage directory structure on your local drive:

```powershell
# [LOCAL-ONLY] Create backup directory stamped with date
$BACKUP_DATE = (Get-Date -Format "yyyyMMdd_HHmmss")
$BACKUP_DIR = "C:\Users\bm440\Desktop\ARTVAULT_WEB\artvault_backups\$BACKUP_DATE"

New-Item -ItemType Directory -Path "$BACKUP_DIR\database" -Force
New-Item -ItemType Directory -Path "$BACKUP_DIR\storage\artworks" -Force
New-Item -ItemType Directory -Path "$BACKUP_DIR\storage\avatars" -Force
Write-Host "Backup target created at: $BACKUP_DIR"
```

---

### Phase B: Database Schema & Role Backup `[REMOTE READ-ONLY]`

*Prerequisite: Native `pg_dump` on PATH or Docker Desktop running.*

#### Step 1: Backup Roles and Permissions
```bash
# [REMOTE READ-ONLY] Dump database roles and privileges
supabase db dump --linked --role-only -f "$BACKUP_DIR/database/01_roles.sql"
```

#### Step 2: Backup Full Schema (DDL)
```bash
# [REMOTE READ-ONLY] Dump structure of public, auth, and cron schemas
supabase db dump --linked -f "$BACKUP_DIR/database/02_schema.sql"
```

---

### Phase C: Production Data Backup (DML) `[REMOTE READ-ONLY]`

#### Step 3: Dump Public and Migration Data
```bash
# [REMOTE READ-ONLY] Dump all table data including migration tracking
supabase db dump --linked --data-only --schema public,supabase_migrations -f "$BACKUP_DIR/database/03_public_data.sql"
```

#### Step 4: Dump Auth User Accounts and Identities
```bash
# [REMOTE READ-ONLY] Dump authentication users and encrypted passwords
supabase db dump --linked --data-only --schema auth -f "$BACKUP_DIR/database/04_auth_data.sql"
```

#### Step 5: Verify Dump Integrity Locally `[LOCAL-ONLY]`
```powershell
# [LOCAL-ONLY] Inspect dump file sizes and header lines
Get-ChildItem -Path "$BACKUP_DIR\database" | Select-Object Name, Length, LastWriteTime
Get-Content "$BACKUP_DIR\database\03_public_data.sql" -Head 15
```

---

### Phase D: Supabase Storage Binary Download `[REMOTE READ-ONLY]`

#### Step 6: Download Binary Payloads via Supabase CLI
```bash
# [REMOTE READ-ONLY] Recursively copy all artwork assets
supabase storage cp -r ss:///artworks "$BACKUP_DIR/storage/artworks" --linked

# [REMOTE READ-ONLY] Recursively copy all avatar images
supabase storage cp -r ss:///avatars "$BACKUP_DIR/storage/avatars" --linked
```

#### Step 7: Verify Storage Backup Locally `[LOCAL-ONLY]`
```powershell
# [LOCAL-ONLY] Count downloaded objects and calculate total size
$fileCount = (Get-ChildItem -Path "$BACKUP_DIR\storage" -Recurse -File).Count
$totalSizeMB = [math]::Round(((Get-ChildItem -Path "$BACKUP_DIR\storage" -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB), 2)
Write-Host "Storage Backup Verified: $fileCount files, $totalSizeMB MB"
```

---

### Phase E: Zero-Cost Recovery Drill in Isolated Staging `[REMOTE-MUTATING]`

> [!CAUTION]
> **NEVER execute recovery steps on the production project (`fqxhjijxgdjfthmfokqk`).**  
> Test recovery ONLY on a brand-new, isolated free staging project.

#### Step 8: Create an Isolated Free Test Project `[LOCAL-ONLY / MANUAL]`
1. Log in to [Supabase Dashboard](https://supabase.com/dashboard).
2. Create a new organization or use an available free slot to launch a temporary project: `artvault-recovery-drill`.
3. Note the new project reference ID and database password.

#### Step 9: Link and Restore Schema on Test Project `[REMOTE-MUTATING]`
```bash
# [REMOTE-MUTATING] Link to temporary recovery project ONLY
supabase link --project-ref <TEMP_DRILL_PROJECT_REF>

# [REMOTE-MUTATING] Apply standard migrations to recreate clean schema
supabase db push
```

#### Step 10: Restore Data to Test Project `[REMOTE-MUTATING]`
Using `psql` or Supabase SQL Editor:
```bash
# [REMOTE-MUTATING] Restore public data into drill project
psql -h aws-0-<region>.pooler.supabase.com -p 5432 -d postgres -U postgres.<TEMP_DRILL_PROJECT_REF> -f "$BACKUP_DIR/database/03_public_data.sql"

# [REMOTE-MUTATING] Restore auth accounts into drill project
psql -h aws-0-<region>.pooler.supabase.com -p 5432 -d postgres -U postgres.<TEMP_DRILL_PROJECT_REF> -f "$BACKUP_DIR/database/04_auth_data.sql"
```

#### Step 11: Restore Storage Assets to Test Project `[REMOTE-MUTATING]`
```bash
# [REMOTE-MUTATING] Upload backup objects to drill project storage
supabase storage cp -r "$BACKUP_DIR/storage/artworks" ss:///artworks
supabase storage cp -r "$BACKUP_DIR/storage/avatars" ss:///avatars
```

#### Step 12: Run Non-Destructive Smoke Verification `[REMOTE READ-ONLY]`
Execute the automated test suite targeting the drill project URL and anon key:
```bash
# [REMOTE READ-ONLY] Verify data integrity against drill environment
node supabase/tests/foundation.test.mjs
node supabase/tests/module09-contracts.mjs
```

#### Step 13: Clean Up / Delete Drill Project `[MANUAL]`
1. Go to Project Settings > General in the Supabase Dashboard.
2. Delete `artvault-recovery-drill` so it consumes $0 and frees up the project slot.
3. Relink your local CLI back to production (`fqxhjijxgdjfthmfokqk`):
   ```bash
   # [LOCAL-ONLY] Re-link CLI to production
   supabase link --project-ref fqxhjijxgdjfthmfokqk
   ```

---

## 6. Pre-Migration Safety Checklist

Before ANY future migration or schema change is applied to production:

- [ ] 1. Create a timestamped folder in `artvault_backups/`.
- [ ] 2. Run `03_public_data.sql` and `04_auth_data.sql` logical data dump.
- [ ] 3. Verify file sizes are greater than 0 KB.
- [ ] 4. Sync storage buckets (`artworks`, `avatars`) locally.
- [ ] 5. Confirm no active users are bidding in a live auction (`SELECT count(*) FROM auctions WHERE status = 'ACTIVE'`).
- [ ] 6. Only then proceed with planned schema updates.

