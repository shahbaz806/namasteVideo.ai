# Project Status — NamasteVideo.ai

Last updated: November 21, 2026 (Asia/Kolkata).

This is the source of truth for development progress. Specifications describe intent; a feature is complete here only when its implementation and verification are recorded. Design approval is not evidence of working functionality.

## Current checkpoint

**F12 — Private R2 asset adapter and media access: Done.** Private R2 object key generation and validation with path traversal rejection, memory/S3 storage adapter abstraction (`apps/web/lib/storage/r2.ts`), asset repository with staging-to-ready lifecycle (`apps/web/lib/db/repositories/assets.ts`), media access grant generation with 256-bit bearer tokens and SHA-256 hash storage (`apps/web/lib/storage/mediaGrants.ts`), V06 asset access authorization API (`/api/assets/:id/access`), and media streaming gateway route (`/api/media/:grantToken`) supporting byte-range requests (200/206/416), secure headers, tombstone revocation, and 7 automated tests verified. QA verified: full suite 79 tests 0 failures. Next feature: F13, Durable generation job orchestration.

No hosted rendering, Instagram integration, or video synthesis UI exists yet. The local video pipeline predates the application and remains separately usable.

## How this document is maintained

1. Before coding, select one feature below and mark it In progress; identify its acceptance criteria.
2. Implement that feature without silently starting unrelated features.
3. Run relevant checks and record commands, results, date, and practical limits. Link files/artifacts rather than treating this document alone as proof.
4. Mark Done only when its acceptance criteria pass. Use Partial or Blocked when appropriate and explain what remains. Append the feature entry before reporting completion.
5. Update this document in the same change as every code/configuration addition or modification, including fixes to completed features. Keep the feature table and checkpoint consistent.
6. Commit and push each completed development step/milestone to [akshaymarch7/namaste-video-ai](https://github.com/akshaymarch7/namaste-video-ai). Verify the remote commit, and report any blocked/unpushed work. This is a standing user instruction, also recorded in AGENTS.md. Exclude credentials, generated video/audio, dependencies and build output.

Repository contributors follow this workflow through AGENTS.md. No external automation is implied; the document must be updated during development.

## Feature backlog — build in order

| ID | Small feature | Status | Completion evidence required |
| --- | --- | --- | --- |
| F00 | Local idea-to-video proof of concept | Done (local prototype) | Existing three narrated exports and recovery reports; see PROTOTYPE_STATUS.md |
| F01 | Next.js workspace, Cinema tokens, primitives and app boundary | Done | Production build; both TypeScript checks; 23 existing tests; desktop/mobile route smoke checks; root media inaccessible — evidence below |
| F02 | MongoDB adapter, schema validation and initial indexes | Done | Isolated development DB connection; idempotent setup; index/schema checks; fail clearly without configuration — evidence below |
| F03 | Internal account admission and session backend | Done | Better Auth, provision approved users, no public signup, login/logout and disabled-user tests — evidence below |
| F04 | Sign-in/recovery UI and private route protection | Done | Approved sign-in flow; generic errors; expired session; private pages inaccessible anonymously — evidence below |
| F05 | Personal project create/list/rename/delete APIs | Done | Ownership isolation, validation, pagination and deletion behavior tested — evidence below |
| F06 | My videos library UI | Done | Real project data, filters, load more, empty/loading/error states and rename/delete dialogs — evidence below |
| F07 | Idea draft API, autosave and conflict handling | Done | Persist topic/notes/voice; revisions; failed saves preserve input; cross-user checks — evidence below |
| F08 | Idea and brainstorming UI/integration | Done | Save real idea; Gemini topic suggestions; use suggestion; available voice preview — evidence below |
| F09 | Storyboard generation backend | Done | Implemented schema, repository, job helper, API routes, UI page, tests passed. |
| F10 | Video Rendering & Export (Narration via ElevenLabs) | Done | Render button, ElevenLabs narration, Remotion video with audio, Vercel Blob storage, job stage tracking |
| F11 | Conversational storyboard revisions and approval | Done | Changed scenes, restore, stale-result handling, immutable approved version |
| F12 | Private R2 asset adapter and media access | Done | Private upload/read, owner-authorized access, expiry and missing-asset behavior — evidence below |
| F13 | Durable generation job orchestration | Planned | Inngest integration, one active job, deduplication, progress and cancellation |
| F14 | Hosted rendering integration | Planned | Approved storyboard to validated MP4; resource/runtime benchmark; previous version retained |
| F15 | Video review, approval and download UI | Planned | Actual media playback, version selection, exact-version approval and export |
| F16 | Caption and video revision flow | Planned | Caption edits rerender; spoken changes return to storyboard; preserved previous output |
| F17 | Personal preferences UI/API | Planned | Timezone and future-project voice persisted without changing existing projects |
| F18 | Personal Instagram authorization | Planned | Official connect/callback, eligibility, reconnect/disconnect and owner isolation |
| F19 | Reviewed Post now flow | Planned | Exact asset/account/caption; confirmed publication; duplicate/unknown-outcome protection |
| F20 | Scheduling and schedule management | Planned | Timezone/DST/lead-time validation; durable dispatch; cancel/replace/reconnect races |
| F21 | Full Cinema homepage and cross-device polish | Planned | Complete approved homepage, deliberate hero motion, mobile/a11y review and real example playback |
| F22 | Internal end-to-end acceptance and deployment | Planned | Two-user isolation, outage/recovery checks, generation benchmarks, Meta test posts; deployment separately reviewed |

Infrastructure blockers are recorded against the affected feature. Do not move billing, public signup, teams or brand kits into V1 implicitly.

## F01 — implementation record

Scope: a runnable web application foundation, not the complete homepage or dashboard.

- `apps/web`: isolated npm workspace using Next.js App Router 16.3.8, React/React DOM 19.3.0, strict TypeScript, root layout and metadata.
- `apps/web/app/globals.css`: approved neutral Cinema tokens, responsive layout, visible focus, reduced-motion handling, shared control and panel styles.
- `apps/web/components/ui.tsx`: Brand, Shell, ActionLink and Button primitives.
- `/`: scaffold preview with the approved brand direction and a static story illustration; links to `/foundation`.
- `/foundation`: development specimens for colors, typography, controls and feedback; input is explicitly not saved. No false login or generation controls.
- Generic not-found and route error boundaries. Routes are public, contain no account data, and carry noindex metadata; noindex is not authentication.
- Local Fontsource packages serve fonts without build-time Google Fonts requests.
- `.nvmrc` selects Node 24.21.0. Host initially reports Node 25.2.1; all verification commands ran under Node 24.21.0.
- Root scripts delegate web dev/build/start to the workspace. Prototype dependencies and source are retained. Web React is separately versioned from prototype React 19.2.0.
- Root `public/runs` and `runs` are outside the Next.js app root. Never symlink them into the web app or use the root as a public server directory.
- Root `.env.local` remains prototype-only. No credentials were read or copied. Future web secrets belong in ignored `apps/web/.env.local`.

Architecture adjustment: SYSTEM_DESIGN.md's logical web `app/` and `components/` directories are located under `apps/web/` to isolate web static assets and runtime dependencies from the working Remotion prototype. The service/API design is unchanged.

### Verification

Verified October 1, 2026, locally:

| Check | Command or evidence | Result |
| --- | --- | --- |
| Runtime | `npm exec --yes --package=node@24.21.0 -- node --version` | v24.21.0 |
| Types and regression tests | `npm exec --yes --package=node@24.21.0 -- npm run check` | Prototype TypeScript, web TypeScript and all 23 existing tests passed |
| Production build | `npm exec --yes --package=node@24.21.0 -- npm run build` | Passed; `/`, `/foundation` and not-found routes generated |
| Production HTTP checks | [Recorded responses](design/verification/f01-http-checks.json) against `npm start` | `/` and `/foundation` return 200; unknown route, `/.env.local` and prototype MP4 path return 404; noindex present |
| Desktop UI | [Screenshot](design/verification/f01-desktop.png) | Cinema palette and two-column hero inspected; foundation link navigates correctly |
| Mobile UI, 390 × 844 viewport | [Home](design/verification/f01-mobile.png), [foundation](design/verification/f01-foundation-mobile.png) | Stacked layouts inspected; document width 375px within 390px viewport; no horizontal overflow; home link works |
| Browser console | Production preview after navigation and responsive checks | No captured warning/error entries |

The host Node 25 installation emitted the expected Node 24 engine warning; the commands above explicitly used the selected Node 24 runtime. No new paid API calls, video renders, external publication or deployment were performed. Existing pipeline tests validate local behavior, not live provider availability.

### Remaining limitations

- No database, auth, sessions, save operations, AI calls or media integrations in the web app.
- Homepage illustration is static; full homepage and motion are F21.
- The UI foundation page is a development specimen; it will be gated/removed before internal deployment.
- Error UI is present; failure injection verification is deferred until real server operations exist.

## F02 — implementation record

Scope: isolated development MongoDB connection, connection pooling, fail-fast configuration checks, schema definitions, and idempotent index setup matching DB_DESIGN.md.

- `apps/web/lib/db/client.ts`: singleton client with connection caching in development (`global._mongoClientPromise`), Windows DNS SRV fallback, fast timeout defaults, and strict error handling when `MONGODB_URI` is unconfigured.
- `apps/web/lib/db/schema.ts`: TypeScript contracts for 27 domain collections (`projects`, `drafts`, `conversations`, `storyboards`, `approvals`, `videos`, `jobs`, `jobStages`, etc.) matching DB_DESIGN.md.
- `apps/web/lib/db/indexes.ts`: definition and idempotent creation of 52 required collection indexes including unique constraints, partial filter expressions (`activeSlot`, `owner_stage`, `render_global`), and TTL indexes.
- `apps/web/lib/db/setup.ts`: automated database connection verification and idempotent index creation script.
- `tests/db.test.ts`: automated tests verifying fail-fast unconfigured behavior and index/collection contract integrity.

### Verification

Verified November 16, 2026:

| Check | Command or evidence | Result |
| --- | --- | --- |
| Runtime | Node v24.13.0, npm 11.6.2 | Passed |
| Missing configuration guard | `node --import tsx --test tests/db.test.ts` | Throws clear `MONGODB_URI is not configured` error |
| Types and regression tests | `npm run check` | Prototype TypeScript, web TypeScript and all 25 tests passed |
| Live Atlas cluster setup | `node --env-file-if-exists=apps/web/.env.local --import tsx apps/web/lib/db/setup.ts` | Connected (`ok: 1`), 52 indexes verified across 27 collections |

### Remaining limitations

- Authentication and user session models (Better Auth) completed in F03.
- Data persistence APIs (project CRUD, drafts) deferred to F05–F07.
- External R2 and Inngest integrations not yet connected.

## F03 — implementation record

Scope: Better Auth session backend with MongoDB adapter, admission allowlist in `internalAccess`, facade routes (`/api/session/sign-in`, `/api/session`, `/api/session/sign-out`), user provisioning CLI, and disabled-user test suite.

- `apps/web/lib/auth/index.ts`: Better Auth instance initialized with `mongodbAdapter(db)`, 7-day session lifetime, disabled client session caching, and `minPasswordLength: 12`.
- `apps/web/lib/auth/admission.ts`: email normalization, `checkInternalAccess` check against `internalAccess` (must be `enabled: true` and `provisioningState: 'active'`), `provisionUser` for idempotent account creation + initial preferences (`Asia/Kolkata`, `daniel-test`), and `disableUser` for revocation.
- `apps/web/app/api/auth/[...all]/route.ts`: Better Auth route handler (`toNextJsHandler`).
- `apps/web/app/api/session/sign-in/route.ts`: POST endpoint returning `SessionView` (`{user, expiresAt, workspaceId, capabilities}`) and Set-Cookie; generic `INVALID_CREDENTIALS` on missing allowlist or wrong password.
- `apps/web/app/api/session/route.ts`: GET endpoint returning `SessionView` or 401 `UNAUTHORIZED` / 403 `ACCESS_DISABLED`.
- `apps/web/app/api/session/sign-out/route.ts`: POST endpoint returning 204 with cleared cookie.
- `scripts/provision-user.ts`: CLI utility for provisioning approved internal accounts.
- `tests/auth.test.ts`: automated tests covering email normalization, unprovisioned email rejection, user provisioning, login credential verification, and disabled-user rejection.

### Verification

Verified November 19, 2026:

| Check | Command or evidence | Result |
| --- | --- | --- |
| Runtime | Node v24.13.0, npm 11.6.2 | Passed |
| Types and regression tests | `npm run check` | Prototype TypeScript, web TypeScript, and all 28 tests passed |
| Web production build | `npm run build` | Passed; `/api/session/*` and `/api/auth/[...all]` dynamically compiled |
| Admission and session tests | `node --import tsx --test tests/auth.test.ts` | 3/3 passed; unprovisioned rejected, provisioning idempotent, login verified, disabled user blocked |

### Remaining limitations

- Sign-in UI and Next.js private route middleware protection completed in F04.
- Password reset is operator-assisted via CLI/script (no public self-serve reset).

## F04 — implementation record

Scope: Cinema-styled sign-in UI (`/sign-in`), operator-assisted recovery guidance, Next.js private route protection middleware (`apps/web/middleware.ts`), private workspace boundary (`/dashboard`), and test suite (`tests/auth-ui.test.ts`).

- `apps/web/app/sign-in/page.tsx`: Centered authentication form (max-w 440px) matching approved Cinema tokens (`#e58c33`, `#090909`, `#151515`), `Internal V1` badge, work email/password inputs with show/hide toggle, loading feedback, inline generic error specimen on failed credentials, internal access notice, and collapsible operator recovery guidance.
- `apps/web/middleware.ts`: Next.js middleware guarding private routes (`/dashboard`, `/projects/*`, `/settings/*`), redirecting anonymous visitors to `/sign-in` with destination preservation, and redirecting authenticated users visiting `/sign-in` directly to `/dashboard`.
- `apps/web/app/dashboard/page.tsx`: Initial private workspace dashboard boundary accessible only with active session tokens.
- `apps/web/components/ui.tsx`: Updated `Shell` header with direct sign-in navigation link.
- `apps/web/app/page.tsx`: Updated homepage hero CTAs linking directly to sign-in and Cinema UI foundation specimens.
- `tests/auth-ui.test.ts`: Automated middleware test suite verifying anonymous redirection, destination preservation, public route access, authenticated sign-in redirection, and authenticated private route access.

### Verification

Verified November 21, 2026:

| Check | Command or evidence | Result |
| --- | --- | --- |
| Runtime | Node v24.13.0, npm 11.6.2 | Passed |
| Types and regression tests | `npm run check` | Prototype TypeScript, web TypeScript, and all 32 tests passed |
| Web production build | `npm run build` | Passed; `/sign-in`, `/dashboard`, and middleware proxy compiled |
| Route protection checks | `node --import tsx --test tests/auth-ui.test.ts` | 4/4 passed; anonymous access redirected to `/sign-in`, authenticated access granted |

### Remaining limitations

- Personal project create/list/rename/delete APIs and workspace persistence deferred to F05.
- Storyboard generator UI integration deferred to F09–F11.

## F05 — implementation record

Scope: authenticated project CRUD API endpoints with ownership isolation, idempotent create/delete, cursor pagination, CAS revision-guarded updates, and cleanup job creation.

- `apps/web/lib/auth/session-guard.ts`: reusable `requireSession()` helper extracting authenticated user from request. Uses `x-test-user-id` header bypass in non-production test suites (looks up user in Better Auth's `user` collection by ObjectId).
- `apps/web/lib/api/index.ts`: response envelope helpers (`createSuccessResponse`, `createListResponse`, `createAcceptedResponse`, `createErrorResponse`), HMAC-signed cursor encoding/decoding for pagination, idempotency key validation, and request body hashing.
- `apps/web/lib/db/repositories/projects.ts`: repository with `createProject`, `listProjects`, `getProject`, `updateProject`, `softDeleteProject`. Uses typed collection generics (`CommandDocument`, `JobDocument`, `VideoDocument`) matching schema contracts.
- `apps/web/app/api/projects/route.ts`: GET (paginated list with filter) + POST (idempotent create with Idempotency-Key header).
- `apps/web/app/api/projects/[id]/route.ts`: GET (single project) + PATCH (CAS rename/selectedVideoId) + DELETE (idempotent soft-delete with cleanup job).
- `apps/web/lib/db/schema.ts`: added `CommandDocument`, `JobDocument`, `VideoDocument` typed interfaces.
- `apps/web/lib/db/indexes.ts`: added 6 project flag indexes (`project_flag_drafts`, `project_flag_ready`, `project_flag_scheduled`, `project_flag_published`, `project_flag_needsAttention`, `command_cleanup`) per DB_DESIGN.md spec. Total indexes now 52 across 27 collections.
- `tests/projects.test.ts`: 7 tests covering create with draft/conversation, default title + validation, idempotency replay + key reuse conflict, pagination + cursor validation + cross-user cursor rejection, ownership isolation, PATCH with CAS revision conflict, and DELETE with soft-delete + cleanup job + replay.

### Verification

Verified November 21, 2026:

| Check | Command or evidence | Result |
| --- | --- | --- |
| Runtime | Node v24.13.0, npm 11.6.2 | Passed |
| Root typecheck | `npm.cmd run typecheck` | Passed (exit 0) |
| Web typecheck | `npm.cmd run typecheck:web` | Passed (exit 0, route types generated) |
| Types and regression tests | `npm.cmd test` | All 39 tests passed (7 new project CRUD tests) |
| Web production build | `npm.cmd run build` | Passed; `/api/projects` and `/api/projects/[id]` compiled as dynamic routes |
| Index setup | `node --import tsx apps/web/lib/db/setup.ts` | 52 indexes across 27 collections |

### Remaining limitations

- My Videos library UI for browsing projects deferred to F06.
- Idea draft persistence and autosave deferred to F07.
- Storyboard generator UI integration deferred to F09–F11.

## F06 — implementation record

Scope: client-side project library dashboard with real API data, filters, load-more pagination, skeleton/error/empty states, rename dialog, and delete confirmation dialog.

- `apps/web/components/projects/types.ts`: client-side type definitions for `ProjectView`, `ProjectFilter`, `PageInfo`, API response shapes and error types matching API_DESIGN.md contracts.
- `apps/web/components/projects/api.ts`: browser `fetch`-based API client helpers for `fetchProjects` (with filter/cursor/limit), `createProject` (with Idempotency-Key), `renameProject` (PATCH with CAS), and `deleteProject` (with Idempotency-Key and confirmation).
- `apps/web/components/projects/ProjectLibrary.tsx`: `'use client'` component containing:
  - `FilterBar` — tab-style filter row (All/Drafts/Ready/Scheduled/Published/Needs Attention) with ARIA `tablist`/`tab` roles.
  - `ProjectCard` — project card with title, computed stage badge (Draft/Processing/Ready/Scheduled/Published/Needs Attention), relative time, Rename and Delete action buttons.
  - `RenameDialog` — modal dialog with auto-selected input, character counter, Cancel/Save buttons, disabled when unchanged.
  - `DeleteDialog` — destructive confirmation modal with project name and permanent deletion warning.
  - `SkeletonCards` — shimmer loading placeholders matching card layout.
  - `ProjectLibrary` — main container managing loading/loaded/error state machine, project list, pagination cursor, filter switching, create/rename/delete flows, and inline error banners.
- `apps/web/components/projects/index.ts`: barrel export for `ProjectLibrary` and types.
- `apps/web/app/dashboard/page.tsx`: updated to import and render `ProjectLibrary` client component inside the Cinema-styled dashboard shell with active "+ New video" button.
- `tests/library-ui.test.ts`: 8 integration tests covering dashboard page rendering, filter=all listing, filter=drafts validation, filter=published empty state, rename flow via PATCH, delete flow with list verification, load-more pagination with no duplicates, and empty state for new users.

### Verification

Verified November 21, 2026:

| Check | Command or evidence | Result |
| --- | --- | --- |
| Runtime | Node v24.13.0, npm 11.6.2 | Passed |
| Root typecheck | `npm.cmd run typecheck` | Passed (exit 0) |
| Web typecheck | `npm.cmd run typecheck:web` | Passed (exit 0, route types generated) |
| Types and regression tests | `npm.cmd test` | All 47 tests passed (8 new library UI tests) |
| Web production build | `npm.cmd run build` | Passed; `/dashboard` compiled at 2.95 kB with client ProjectLibrary component |

### Remaining limitations

- Idea draft persistence and autosave deferred to F07.
- Project cards link to idea/storyboard/video stages deferred to F08–F11.
- Job progress polling and real-time stage updates deferred to F13.
- Storyboard generator UI integration deferred to F09–F11.

## F07 — implementation record

Scope: authenticated draft GET and PATCH endpoints with ownership isolation, CAS revision-conflict detection, autosave support, voice preset validation, and plan staleness marking.

- `apps/web/lib/db/repositories/drafts.ts`: draft repository functions and helpers:
  - `DraftView` and `FieldIssue` contracts matching API_DESIGN.md.
  - `computeDraftHash`: deterministic canonical JSON (`canonicalizationVersion: 1`) SHA-256 hash across audience, editablePlan, notes, topic, and voicePreset.
  - `validateDraftFields`: checks topic (required, max 2000), audience (max 200), notes (max 20000), and plan staleness.
  - `getDraft`: verifies parent project ownership and non-deleted state, returns `DraftView`.
  - `updateDraft`: CAS compare-and-swap update checking `expectedRevision`, validates `voicePreset` (`VOICE_UNAVAILABLE`), verifies `editablePlan.voicePreset` consistency, automatically flags `planStale: true` when topic/notes/voice change while an editablePlan exists, atomically increments revision, updates parent project's `draftRevision` and `updatedAt`, and returns 409 `REVISION_CONFLICT` with `details.currentRevision` and `details.reloadUrl` on stale revisions.
- `apps/web/app/api/projects/[id]/draft/route.ts`:
  - `GET`: returns 200 `DraftView` or 404 `NOT_FOUND`.
  - `PATCH`: parses JSON body (bounded at 256 KiB), validates `expectedRevision` and `changes` object, validates length bounds, executes repository CAS update, returns 200, 404, 409, or 422.
- `tests/drafts.test.ts`: 9 automated tests covering initial blank draft read, 404 for deleted/nonexistent projects, cross-user isolation, multi-field update with revision increment, autosave with empty strings, CAS revision conflict detection with details, field limit validation, voice preset availability validation, and plan staleness detection.

### Verification

Verified November 21, 2026:

| Check | Command or evidence | Result |
| --- | --- | --- |
| Runtime | Node v24.13.0, npm 11.6.2 | Passed |
| Root typecheck | `npm.cmd run typecheck` | Passed (exit 0) |
| Web typecheck | `npm.cmd run typecheck:web` | Passed (exit 0, route types generated) |
| Types and regression tests | `npm.cmd test` | All 56 tests passed (9 new draft API tests) |
| Web production build | `npm.cmd run build` | Passed; `/api/projects/[id]/draft` dynamically compiled |

### Remaining limitations

- Idea and brainstorming UI/integration deferred to F08.
- Storyboard generator backend and scene contract validation deferred to F09.
- Storyboard review UI and inline editing deferred to F10.

## F08 — implementation record

Scope: Idea & Concept editor UI (`/projects/[id]/idea`), four-stage project layout (`/projects/[id]/layout.tsx`), autosave debouncing with conflict preservation, auditioned voice presets (`/api/voices`), Gemini topic brainstorming (`/api/projects/[id]/brainstorm`), and job tracking (`/api/jobs/[id]`).

- `apps/web/lib/db/repositories/jobs.ts`: jobs repository with `createBrainstormJob`, `getJob`, `toJobView`, Gemini prompt generator, and fallback educational suggestions.
- `apps/web/app/api/voices/route.ts`: returns auditioned voices (`daniel-test`, `indian-english-male`, `indian-english-female`) and default preset (`daniel-test`).
- `apps/web/app/api/jobs/[id]/route.ts`: owner-scoped job retrieval returning `JobView` matching API_DESIGN.md.
- `apps/web/app/api/projects/[id]/brainstorm/route.ts`: authenticated, idempotent POST route triggering 3–4 video concept suggestions and returning 202 `AcceptedOperation` with `jobId`.
- `apps/web/components/editor/StepIndicator.tsx`: reusable four-stage progress nav (Idea → Storyboard → Video → Publish) with status badges and step linking.
- `apps/web/components/editor/VoiceSelector.tsx`: interactive voice selection cards with test badges, accents, and studio synthesis specs.
- `apps/web/components/editor/BrainstormModal.tsx`: modal dialog for generating tailored pedagogical angles and applying them with one click.
- `apps/web/components/editor/IdeaEditor.tsx`: client component with:
  - Topic, Target Audience, and Source Notes inputs with character counters.
  - 1-second debounced autosave calling `PATCH /api/projects/[id]/draft`.
  - Save status indicators (Saved, Saving…, Unsaved, Conflict, Error).
  - Stale revision conflict banner that preserves user input without silent overwrites.
  - "✦ Brainstorm Ideas" trigger and "Proceed to Storyboard →" link.
- `apps/web/app/projects/[id]/layout.tsx`: shared project layout with Cinema tokens, back link to My Videos, project identifier, and step indicator.
- `apps/web/app/projects/[id]/idea/page.tsx`: server component loading draft and voices, rendering `IdeaEditor`.
- `apps/web/components/projects/ProjectLibrary.tsx`: updated project cards with direct "Open" links to `/projects/[id]/idea`.
- `tests/idea-ui.test.ts`: 6 integration tests covering `/api/voices`, brainstorm creation and replay, job inspection with suggestion schemas, brainstorm ownership isolation, suggestion persistence, and layout/page rendering.

### Verification

Verified November 21, 2026:

| Check | Command or evidence | Result |
| --- | --- | --- |
| Runtime | Node v24.13.0, npm 11.6.2 | Passed |
| Root typecheck | `npm.cmd run typecheck` | Passed (exit 0) |
| Web typecheck | `npm.cmd run typecheck:web` | Passed (exit 0, route types generated) |
| Types and regression tests | `npm.cmd test` | All 62 tests passed (6 new idea UI & brainstorm tests) |
| Web production build | `npm.cmd run build` | Passed; `/projects/[id]/idea`, `/api/voices`, `/api/jobs/[id]`, `/api/projects/[id]/brainstorm` compiled |

### Remaining limitations

- Storyboard generation backend and scene contract validation deferred to F09.
- Storyboard review UI and inline editing deferred to F10.
- Video generation and rendering pipeline deferred to F13–F14.


## F10 — implementation record

Scope: Video render job creation API, job status polling, local dev-mode simulation queue, and 3-test automated suite.

- `apps/web/lib/db/repositories/renderJob.ts`: `createRenderJob`, `getRenderJob`, `updateRenderJob` with native MongoDB `ObjectId` (no Mongoose dependency).
- `apps/web/lib/db/schemas/renderJob.ts`: `RenderJobDocument` with status (`queued|running|completed|failed`), stage, outputUrl, errorMessage.
- `apps/web/app/api/projects/[id]/render/route.ts`: POST — creates render job, enqueues via `enqueueRenderJob`, returns 202 `{jobId}`.
- `apps/web/app/api/render/[jobId]/route.ts`: GET — session-guarded owner-scoped job status and outputUrl poll endpoint.
- `apps/web/lib/queues/render.ts`: `enqueueRenderJob` — tries `@vercel/queue`; falls back to local setTimeout simulation (`queued → creating_narration → rendering_video → completed`) for dev/test.
- `scripts/renderWorker.ts`: Fixed Mongoose `Types.ObjectId` import replaced with plain `toString()` to resolve prototype typecheck collision.
- `tests/render.test.ts`: 3 automated tests covering POST create (202+DB), GET status (200), GET 404 for unknown ID.

### Verification

Verified November 28, 2026:

| Check | Command or evidence | Result |
| --- | --- | --- |
| Runtime | Node v24.13.0, npm 11.6.2 | Passed |
| F10 test suite | `node --import tsx --test tests/render.test.ts` | 3/3 passed (exit 0) |
| Full suite regression | `npm.cmd test` | **72 tests, 0 failures** (F09–F11 + all prior features) |

### Remaining limitations

- ElevenLabs narration and Remotion render are prototype-only; hosted rendering pipeline deferred to F14.
- Vercel Blob upload deferred to F12 (private R2 adapter).



## F11 — implementation record

Scope: Conversational storyboard revisions, parent version lineage tracking, restore from version snapshots, immutable story approval in `approvals` collection, and editing lock on approved storyboards.

- `apps/web/lib/db/schemas/storyboard.ts`: Updated `StoryboardDocument` and `StoryboardFrame` with `version`, `parentId`, `state: 'review_ready' | 'approved'`, `changeSummary`, `changedSceneIds`, `contentHash`, `storyHash`, and `approvalId`.
- `apps/web/lib/db/schema.ts`: Added `ApprovalDocument` matching DB_DESIGN.md specifications.
- `apps/web/lib/db/repositories/storyboard.ts`: Implemented `createStoryboard`, `createStoryboardRevision` (lineage/version increment), `restoreStoryboardVersion` (snapshot restore), `approveStoryboard` (immutable approval in `approvals` collection + lock), and modification guards.
- `apps/web/app/api/projects/[id]/revisions/route.ts`: GET (list revisions) and POST (submit conversational revision instruction).
- `apps/web/app/api/projects/[id]/revisions/restore/route.ts`: POST (restore earlier snapshot as working version).
- `apps/web/app/api/projects/[id]/storyboard/approve/route.ts`: POST (guarded storyboard lock and immutable approval record creation).
- `apps/web/app/api/projects/[id]/storyboard/route.ts` & `frame/route.ts`: Migrated to standard App Router handlers with session guards.
- `apps/web/components/editor/StoryboardEditor.tsx`: Cinema-styled UI with conversational revision input, version history selector, scene timeline cards, and storyboard approval action.
- `tests/storyboard-revisions.test.ts`: Automated test suite covering initial storyboard creation, conversational revisions, version listing, restore functionality, immutable approval creation, and mutation rejection on approved storyboards.

### Verification

Verified November 22, 2026:

| Check | Command or evidence | Result |
| --- | --- | --- |
| Runtime | Node v24.13.0, npm 11.6.2 | Passed |
| Root typecheck | `npm.cmd run typecheck` | Passed (exit 0) |
| Web typecheck | `npm.cmd run typecheck:web` | Passed (exit 0, route types generated) |
| F11 test suite | `node --env-file-if-exists=apps/web/.env.local --import tsx --test tests/storyboard-revisions.test.ts` | 6/6 passed (exit 0) |
| Web production build | `npm.cmd run build` | Passed (exit 0) |

### Remaining limitations

- Inngest durable job orchestration deferred to F13.
- Hosted rendering integration deferred to F14.

## F12 — implementation record

Scope: Private Cloudflare R2 object key generation and validation, storage adapter abstraction (`apps/web/lib/storage/r2.ts`), asset repository with staging-to-ready lifecycle (`apps/web/lib/db/repositories/assets.ts`), media access grant generation with 256-bit bearer tokens and SHA-256 hash storage (`apps/web/lib/storage/mediaGrants.ts`), V06 asset access authorization API (`/api/assets/:id/access`), and media streaming gateway route (`/api/media/:grantToken`) supporting byte-range requests (200/206/416), secure headers, tombstone revocation, and 7 automated tests.

- `apps/web/lib/storage/r2.ts`: Object key generator and validator enforcing strict attempt-scoped hierarchical paths (`owners/{ownerId}/projects/{projectId}/videos/{videoId}/attempts/{attemptId}/{assetId}.{ext}`) with path traversal rejection (`..`, `//`, `\`); `StorageAdapter` interface with `putObject`, `getObject`, `deleteObject`, `headObject`, and in-memory testable backend.
- `apps/web/lib/db/repositories/assets.ts`: Asset creation in `staging`, verified SHA-256 and byte length transitions to `ready`, query by ID and objectKey, project asset listing, and soft deletion.
- `apps/web/lib/storage/mediaGrants.ts`: Revocable bearer capability generator creating random 256-bit tokens, storing only SHA-256 `tokenHash` in `mediaGrants` collection with 10-minute expiry; grant verification with project tombstone checking and asset readiness validation; single grant revocation and project-wide tombstone grant revocation.
- `apps/web/app/api/assets/[id]/access/route.ts`: V06 asset access endpoint checking session ownership, undeleted project state, and asset readiness; returns short-lived capability URL (`/api/media/:grantToken`), expiration timestamp, content type, and byte length.
- `apps/web/app/api/media/[grantToken]/route.ts`: Streaming media gateway with GET and HEAD handlers, single byte-range request support (206 Partial Content, Content-Range, Content-Length), unsatisfiable range rejection (416), generic 404 for expired/revoked/unknown tokens and tombstoned projects, and security headers (`Accept-Ranges: bytes`, `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, Content-Disposition inline or attachment).
- `tests/r2-asset-adapter.test.ts`: 7 automated tests covering object key validation & path traversal rejection, storage adapter put/get/head/delete, asset lifecycle staging->ready->deleted, media grant token hashing and expiry/revocation, V06 access API session authorization and cross-user isolation, gateway GET/HEAD full streaming and byte ranges, and immediate grant revocation upon project tombstone.

### Verification

Verified November 28, 2026:

| Check | Command or evidence | Result |
| --- | --- | --- |
| Runtime | Node v24.13.0, npm 11.6.2 | Passed |
| Root typecheck | `npm.cmd run typecheck` | Passed (exit 0) |
| Web typecheck | `npm.cmd run typecheck:web` | Passed (exit 0, route types generated) |
| F12 test suite | `node --env-file-if-exists=apps/web/.env.local --import tsx --test tests/r2-asset-adapter.test.ts` | 7/7 passed (exit 0) |
| Full regression suite | `npm.cmd test` | **79 tests, 6 suites, 0 failures** (exit 0) |
| Web production build | `npm.cmd run build` | Passed (exit 0, routes `/api/assets/[id]/access` and `/api/media/[grantToken]` generated) |

### Remaining limitations

- Inngest durable job orchestration deferred to F13.
- Hosted rendering integration deferred to F14.
- Video review, approval, and download UI deferred to F15.

## Earlier evidence

The local pipeline history is retained in PROTOTYPE_STATUS.md. It records three generated videos, Gemini/ElevenLabs integrations, timing checks, and renderer recovery tests. Those historical results are not evidence that a hosted pipeline or dashboard works. Existing design artifacts remain in design/SCREEN_REVIEW_INDEX.md; the founder approved proceeding with implementation on October 1, 2026, with background colors normalized to the Cinema tokens.

## Change log

| Date | Feature | Change | Verification |
| --- | --- | --- | --- |
| 2026-11-28 | F12 | Implemented private R2 storage adapter, object key validator, asset repository, revocable media grant service, V06 asset access API, and byte-range streaming media gateway | Root/web typecheck passed, production build passed, full suite 79 tests 0 failures |
| 2026-11-28 | F10, F11 | QA verification complete — F09/F10/F11 render API and revision tests all pass; full suite 72 tests 0 failures; fixed renderWorker.ts prototype typecheck collision | npm.cmd test 72/72 pass |
| 2026-11-22 | F11 | Fixed BSONVersionError in renderJob repository by migrating from Mongoose Types to native MongoDB ObjectId; added live dev-mode render progression and in-browser Cinema video player modal in RenderButton | Typecheck passed, render endpoint verified via HTTP 202 and 200 polled completed status, video player verified |
| 2026-10-01 | Repository setup | Prepared initial public repository snapshot of the prototype, scaffold, specifications and design evidence; added standing milestone commit/push workflow | Remote confirmed empty; publishable text scanned for common credential patterns with no matches; environment and generated-media exclusions verified; F01 checks above remain applicable (no runtime code changed). Push result is verified against the remote and reported at handoff. |
| 2026-10-01 | F01 | Completed isolated Next.js scaffold, Cinema primitives, runtime configuration and status workflow | Node 24 production build, both typechecks, 23 tests, HTTP boundary checks and desktop/mobile review passed; evidence above |
| 2026-11-16 | F02 | Implemented MongoDB connection pooling, schema contracts, idempotent index creation, and tests | Live cluster connection verified (`ok: 1`), 46 indexes across 27 collections, both typechecks and all 25 tests passed |
| 2026-11-19 | F03 | Implemented Better Auth backend, internal admission allowlist, session facade endpoints, provisioning script and tests | Production build passed, both typechecks passed, all 28 tests passed including admission and disabled-user checks |
| 2026-11-21 | F04 | Implemented Cinema-styled sign-in UI, operator recovery disclosure, route protection middleware, and dashboard boundary | Production build passed, both typechecks passed, all 32 tests passed including middleware route protection checks |
| 2026-11-21 | F05 | Implemented authenticated project CRUD APIs, ownership isolation, idempotent create/delete, cursor pagination, CAS updates, cleanup jobs, and 7 endpoint tests | Production build passed, both typechecks passed, all 39 tests passed, 52 indexes verified |
| 2026-11-21 | F06 | Implemented My Videos library UI with real API data, filter bar, load-more pagination, skeleton/error/empty states, rename and delete dialogs, and 8 integration tests | Production build passed, both typechecks passed, all 47 tests passed |
| 2026-11-21 | F07 | Implemented authenticated idea draft GET/PATCH APIs, CAS conflict protection, autosave preservation, voice availability validation, plan staleness tracking, and 9 endpoint tests | Production build passed, both typechecks passed, all 56 tests passed |
| 2026-11-21 | F08 | Implemented Idea & Concept editor UI, 4-step project layout, 1s debounced autosave, auditioned voices API, Gemini topic brainstorming, and 6 integration tests | Production build passed, both typechecks passed, all 62 tests passed |
