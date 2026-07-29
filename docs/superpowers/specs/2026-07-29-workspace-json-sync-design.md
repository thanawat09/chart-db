# Workspace JSON Sync Design

## Goal

Add a self-hosted synchronization service so every authenticated browser connected to the same ChartDB deployment shares a workspace containing multiple diagrams. Browser edits remain local-first, are saved manually or on a configurable interval, persist to a JSON file owned by the project service, and propagate automatically to other browsers without silent data loss.

## Scope

The first version includes:

- Multiple diagrams in one synchronized workspace.
- A visible manual Save/Sync action and the existing save keyboard shortcut.
- Automatic synchronization every 10 seconds by default.
- A Node service that works locally and when deployed on a VPS.
- One shared deployment password.
- Offline local editing and retry after reconnect.
- Per-diagram merging, conflict detection, conflict resolution, and synchronized deletion.
- Atomic JSON writes and one last-known-good backup.

The first version does not include:

- Individual user accounts, roles, or an audit log.
- Real-time WebSocket delivery.
- Field-level or table-level merging within the same diagram.
- Multiple Node processes writing the same workspace file.
- Internet-facing TLS termination; a reverse proxy such as Caddy or Nginx provides HTTPS.

## Domain Language

The canonical terms are defined in [`CONTEXT.md`](../../../CONTEXT.md):

- A **Workspace** is the synchronized collection.
- A **Diagram** is one visual database-schema model inside the workspace.

## Architecture

One Node process serves the built ChartDB frontend and a same-origin `/api/sync` API in production. In development, the same process exposes the sync API and uses Vite middleware for the frontend. This keeps authentication and sync requests same-origin and gives `npm run dev` and `npm start` equivalent persistence behavior.

The implementation uses Node standard-library filesystem, HTTP, and cryptography APIs plus the Vite dependency already present in the project. No database, WebSocket server, or backend framework is introduced.

The server owns the canonical workspace file. Its default path is `data/chartdb-sync.json`, resolved relative to the project working directory, and it can be changed to an absolute persistent-volume path through the environment.

Each browser continues using the existing Dexie/IndexedDB database as its local working copy. A new sync layer reads complete diagrams from that storage, compares them with the last acknowledged server state, and imports accepted remote changes back into IndexedDB and the currently open editor.

## Configuration

The service reads:

```env
CHARTDB_SYNC_PASSWORD=change-me
CHARTDB_SYNC_INTERVAL_MS=10000
CHARTDB_SYNC_FILE=./data/chartdb-sync.json
HOST=0.0.0.0
PORT=5173
```

Rules:

- `CHARTDB_SYNC_PASSWORD` is required. Startup fails with a clear error when it is absent.
- `CHARTDB_SYNC_INTERVAL_MS` must be an integer of at least 1,000 milliseconds and defaults to 10,000.
- `CHARTDB_SYNC_FILE` defaults to `./data/chartdb-sync.json`.
- `HOST` defaults to `127.0.0.1` locally. VPS deployments set `0.0.0.0`.
- `PORT` defaults to `5173`.
- The browser obtains the sync interval from the authenticated service response, so changing `.env` does not require rebuilding frontend assets.

An `.env.example` documents these values without containing a real password.

## Canonical Workspace File

The persisted file is normal JSON with ISO-8601 timestamps:

```json
{
  "schemaVersion": 1,
  "workspaceRevision": 8,
  "updatedAt": "2026-07-29T10:00:00.000Z",
  "config": {
    "revision": 2,
    "defaultDiagramId": "diagram-a"
  },
  "diagrams": {
    "diagram-a": {
      "revision": 4,
      "updatedAt": "2026-07-29T10:00:00.000Z",
      "hash": "sha256:...",
      "data": {}
    }
  },
  "tombstones": {
    "diagram-b": {
      "revision": 3,
      "deletedAt": "2026-07-29T09:00:00.000Z"
    }
  }
}
```

`data` contains the existing `Diagram` shape without changing IDs. Dates are serialized as ISO strings and restored as `Date` values before entering existing ChartDB domain validation. The existing export helper is not used for synchronization because it intentionally clones a diagram and replaces its IDs.

`workspaceRevision` increases for every accepted batch. Each changed or deleted diagram receives its own monotonically increasing revision. Hashes are calculated from deterministic JSON and allow an unchanged diagram to be recognized without relying only on timestamps.

Tombstones remain in the workspace in this version. This prevents a browser that was offline for a long time from recreating a deleted diagram.

## Authentication

`POST /api/sync/session` accepts the shared password over HTTPS in production and over localhost HTTP during development. The server compares it without timing-sensitive string comparison. Five failed attempts from one client address within 60 seconds block further attempts from that address for 60 seconds.

Successful authentication returns a random bearer token that expires after 12 hours or when the Node service restarts. The browser stores the token in `sessionStorage`, not in the workspace, IndexedDB, logs, or source code. Restarting the browser session or Node service requires authentication again.

Every other sync endpoint requires the bearer token. Production deployments must put the Node service behind HTTPS because the Node service does not terminate public TLS itself.

## Sync API

The primary endpoint is `POST /api/sync`. A request contains:

- A stable browser client ID.
- The workspace revision last acknowledged by that browser.
- Last acknowledged revisions and hashes per diagram.
- New, changed, or deleted local diagrams.
- The last acknowledged config revision and a config change when the shared default diagram changes.

The server serializes write handling within its single process, validates the request, and evaluates each diagram independently:

- If the submitted base revision matches the current server revision, the change is accepted.
- If a new diagram ID has no server diagram or tombstone, it is created.
- If submitted content already matches the server hash, it is acknowledged as unchanged.
- If both sides changed the same diagram from the submitted base revision, that diagram is returned as a conflict and is not changed.
- Non-conflicting changes in the same request are still accepted.

Config has its own revision. A config update with a stale base does not block diagram changes; the current server config is returned and applied because it contains navigation preference rather than diagram content.

When neither side changed, the endpoint returns an empty success response. Otherwise it returns the current canonical workspace, accepted revisions, recovery status, and any conflicts. Request bodies are limited to 50 MiB and all payloads are validated before accessing the filesystem.

## Browser Synchronization

The browser stores sync metadata in IndexedDB:

- Last acknowledged workspace revision.
- Last acknowledged revision and hash for each diagram.
- Last acknowledged config revision.
- A generated browser client ID.

The shared password and bearer token are not stored there.

One `syncNow()` operation is used by:

- The visible Save/Sync button.
- The existing Save menu item.
- The existing save keyboard shortcut.
- The configured recurring timer.
- A visibility/focus event after a hidden tab becomes active.

The operation:

1. Reads every local diagram with tables, relationships, dependencies, areas, custom types, and notes.
2. Creates deterministic hashes and compares them with acknowledged hashes.
3. Detects local creations, edits, and deletions.
4. Sends only those local changes and the acknowledged revisions.
5. Applies accepted server diagrams and tombstones to IndexedDB.
6. Reloads the currently open diagram when its accepted remote version changed.
7. Updates sync metadata only after the storage transaction succeeds.

Only one sync operation runs in a browser at a time. Additional manual or timer requests coalesce into one follow-up run.

Local ChartDB edits continue writing to IndexedDB immediately. A network failure therefore leaves the working copy intact. The status becomes Offline and the same changes are retried on the next interval or manual save.

## Initial Connection

When no sync history exists:

- If the server has no workspace and the browser has diagrams, the first non-empty browser initializes the server.
- If the server has a workspace and the browser is empty, the browser imports the server automatically.
- If both server and browser contain different non-empty data, no automatic overwrite occurs. A dialog asks the user to use the server workspace or explicitly upload the browser workspace.
- Opening an empty browser against an uninitialized server does not create an empty canonical workspace.

## Concurrent Changes

Changes are merged at diagram granularity:

- Browser A changing Diagram 1 while Browser B changes Diagram 2 merges automatically.
- Browser A and Browser B changing Diagram 1 from the same base revision produces a conflict.
- No field-level merge is attempted inside a conflicted diagram.

The conflict dialog offers:

1. **Keep both**: clone the browser version to a new diagram ID, append ` (conflict copy <timestamp>)` to its name, accept the server version under the original ID, and upload the clone as a new diagram. This is the recommended action.
2. **Use server**: replace the browser working copy with the current server version.
3. **Use browser**: explicitly replace the server version only if the server revision shown in the dialog is still current. A newer server revision produces another conflict instead of being overwritten.

## Deletion

Deleting a diagram creates a server tombstone and removes the diagram from other browsers during synchronization. A browser compares missing local IDs with its last acknowledged set, so an intentional deletion is distinguishable from a browser that has never received the diagram.

A tombstone wins over an unchanged stale copy. If an offline browser changed the same diagram after another browser deleted it, the server returns a conflict so the user can preserve the modified copy rather than silently deleting it.

When the default diagram is deleted, the canonical config selects the remaining diagram with the earliest `createdAt` value, using ID as a deterministic tie-breaker, or an empty ID when none remain.

## File Safety and Recovery

For each accepted batch, the server:

1. Builds and validates the complete next workspace in memory.
2. Writes it to a temporary file in the same directory.
3. Flushes and closes the temporary file.
4. Copies the current valid main file to `<sync-file>.bak` when one exists.
5. Atomically renames the temporary file over the main file.

The directory is created when needed. The service never logs diagram content or credentials.

At startup, an invalid main file does not get overwritten. If the backup validates, the service serves it read-only in recovered mode and reports that state to browsers. An authenticated **Restore backup** action calls `POST /api/sync/recover`, preserves the invalid main file as `<sync-file>.corrupt-<timestamp>`, copies the valid backup into place, and resumes normal writes. If neither file validates, the service exposes a clear read/write error while preserving both files.

## User Interface

Before workspace loading, an authentication screen requests the shared password.

The desktop navbar shows a Save/Sync button and status:

- Unsynced
- Saving
- Saved with server timestamp
- Offline
- Conflict
- Recovered from backup

The mobile action menu retains Save/Sync. Existing save keyboard behavior calls `syncNow()` rather than merely changing the local `updatedAt` timestamp.

Recovered mode exposes the Restore backup action. Errors use existing ChartDB dialog, alert, and toast patterns. Authentication failures do not reveal server configuration. Network and server errors do not clear local data.

## Runtime Commands

- `npm run dev` starts the Node service with Vite middleware and the sync API.
- `npm run build` retains the existing lint and TypeScript checks and builds frontend assets.
- `npm test` runs the automated sync tests.
- `npm start` serves the built SPA and sync API for a VPS.

One Node process must own one workspace file. A VPS deployment uses a persistent path for `CHARTDB_SYNC_FILE` and an HTTPS reverse proxy. Multi-process or horizontally scaled deployments require a transactional shared datastore and are outside this version.

## Verification

Automated server tests cover:

- Authentication success, failure, expiry, and throttling.
- Environment validation.
- Initial workspace creation.
- Same-revision updates.
- Independent-diagram merging.
- Same-diagram conflict detection.
- Explicit conflict resolutions.
- Tombstones and stale-browser behavior.
- Atomic writes, restart persistence, corrupt-main fallback, and invalid backup handling.

Automated browser/storage tests cover:

- Local change detection.
- Remote import into IndexedDB.
- Current-diagram refresh.
- Empty and non-empty first connection.
- Offline retry.
- Timer configuration and overlapping-run coalescing.
- Save button and keyboard invocation.

An end-to-end test with two isolated browser contexts proves:

1. Browser A creates multiple diagrams and saves them to the project JSON.
2. Browser B imports them within one configured interval.
3. Manual save writes immediately.
4. Different-diagram edits merge.
5. Same-diagram edits produce a conflict without data loss.
6. All three conflict actions work.
7. Deletion propagates and does not resurrect from stale storage.
8. Restarting the service preserves and reloads the workspace.

## Accepted Decisions

The detailed architectural decisions are recorded in:

- [`0001-prevent-silent-sync-overwrites.md`](../../adr/0001-prevent-silent-sync-overwrites.md)
- [`0002-server-owned-workspace-sync.md`](../../adr/0002-server-owned-workspace-sync.md)
- [`0003-shared-password-for-workspace-access.md`](../../adr/0003-shared-password-for-workspace-access.md)
- [`0004-propagate-deletions-with-tombstones.md`](../../adr/0004-propagate-deletions-with-tombstones.md)
- [`0005-poll-node-api-for-workspace-sync.md`](../../adr/0005-poll-node-api-for-workspace-sync.md)
