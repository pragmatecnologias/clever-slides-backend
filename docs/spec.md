Pastor Decks (you can rename later)

Core promise

Pastor fills a short “Sermon Setup” form → clicks Generate Deck → gets a draft slide deck that looks like a real sermon deck → edits in a simple editor → exports.

1) MVP Scope
Must-have (v1)

Auth (pastor + admin)

Sermon Setup form

Generate deck draft with AI

Slide editor (inline editing)

Theme + brand settings (logo, colors, fonts)

Export:

PPTX (first priority)

PDF (optional in v1, but recommended)

Nice-to-have (v1.5)

Regenerate one slide (not the whole deck)

Add slide / delete slide / reorder

Auto “speaker notes” for pastor (optional)

Out of scope (later)

Multi-language decks

Multi-campus variants

Live-service run mode

Automatic scripture quote retrieval licensing concerns (you can do “summary” safely)

2) User Roles & Permissions
Roles

Admin: manages church branding, users, global templates, model settings.

Pastor: creates sermons and decks, edits, exports.

Editor (optional): can edit decks but not change branding/model settings.

Permissions are straightforward RBAC.

3) High-Level Architecture
Frontend

Next.js (or Vue if you prefer; Next.js recommended for speed + ecosystem)

Tailwind + shadcn/ui

Editor experience: drag/drop reorder, inline text editing

Backend

NestJS (fits your stack)

Modules:

Auth

Sermons

Decks

Slides

Themes/Branding

AI Provider (LM Studio/OpenAI/others)

Export (PPTX/PDF)

Jobs/Queue (recommended)

Storage

Postgres (recommended)

Object storage for exports:

Local disk for dev

S3-compatible for prod (MinIO, S3, GCS)

Async jobs

Deck generation and export should be async:

BullMQ + Redis (simple and reliable)

Allows progress states: queued → generating → ready → exporting → exported

4) Data Model Spec (Backend)
Entity: Church (Tenant)

id

name

timezone

createdAt

Entity: User

id

churchId

email

passwordHash (or external auth)

role (admin/pastor/editor)

createdAt

Entity: BrandTheme

Defines how slides look.

id

churchId

name (e.g., “Sunday Default”, “Youth Night”)

logoUrl

primaryColor, secondaryColor, backgroundStyle

fontHeading, fontBody

defaultTemplatePackId

createdAt, updatedAt

Entity: Sermon

Pastor input (source of truth).

id

churchId

createdByUserId

title

seriesTitle (optional)

date (optional)

mainScriptureRef (e.g., “Psalm 46:1–3”)

bigIdea (1–2 sentences)

mainPoints (string array, 2–5)

audienceContext (optional: string)

tone (enum: hopeful/urgent/reflective/challenging/encouraging)

ctaStyle (enum: salvation/prayer/discipleship/invitation/none)

notes (optional: pastor notes)

createdAt, updatedAt

Entity: Deck

A generated deck instance.

id

churchId

sermonId

themeId

status (draft/generating/ready/exporting/exported/failed)

generationProvider (lmstudio/openai/etc)

generationModel (e.g., “gpt-oss-20b”)

createdAt, updatedAt

Entity: Slide

Each slide is editable and rendered from templates.

id

deckId

orderIndex (int)

type (enum)

title

scripture

point

support

transition

application

prayer

invitation

announcement (optional)

layoutKey (string: maps to a template, ex: title_centered_v1)

content (JSON)

Common pattern: { lines: string[] }

Or typed: title, subtitle, reference, bullets, etc.

speakerNotes (optional string)

imagePrompt (optional string) — later

createdAt, updatedAt

Entity: Export

id

deckId

type (pptx/pdf)

status (queued/rendering/ready/failed)

fileUrl

createdAt

5) Slide Content Contract (Critical)

Your main mistake before: generating paragraphs and hoping it looks like slides.

Slide contract should be “slide-ready”

Examples by type:

title
{ "title": "Hope in the Storm", "subtitle": "Anchored Series • Steadfast Faith" }
scripture
{ "reference": "Psalm 46:1–3", "lines": ["God is our refuge and strength.", "An ever-present help in trouble."] }
point
{ "title": "1) Storms Reveal Our Anchor", "bullets": ["What shakes us shows what we trust.", "Faith isn’t denial—it’s direction."] }
application
{ "title": "This Week", "bullets": ["Name your storm.", "Choose one anchor practice.", "Text someone for prayer."] }

Short, punchy, usable.

6) Backend API Spec (REST)

Base: /api/v1

Auth

POST /auth/login

POST /auth/logout

GET /auth/me

Themes / Branding

GET /themes

POST /themes

PUT /themes/:id

GET /themes/:id

Sermons

GET /sermons

POST /sermons

GET /sermons/:id

PUT /sermons/:id

DELETE /sermons/:id (optional)

Decks

POST /sermons/:sermonId/decks

body: { themeId, deckSize: "short"|"standard"|"long" }

returns deck with status=generating

GET /decks/:deckId

GET /decks/:deckId/slides

PUT /decks/:deckId (rename, change theme maybe)

Slides (Editing)

PUT /slides/:slideId

update content, notes, layoutKey

POST /decks/:deckId/slides

add new slide at position

POST /decks/:deckId/slides/reorder

body: { slideIdsInOrder: string[] }

DELETE /slides/:slideId

Regeneration (v1.5)

POST /decks/:deckId/regenerate

regenerates entire deck from sermon

POST /slides/:slideId/regenerate

regenerates just one slide using sermon context + slide type

Exports

POST /decks/:deckId/exports

body: { type: "pptx"|"pdf" }

GET /decks/:deckId/exports

GET /exports/:exportId/download (signed URL or proxy)

Progress / Events (recommended)

GET /decks/:deckId/status

Optional: SSE endpoint

GET /events?deckId=... (push generation progress)

7) AI Generation Service Spec (Backend)
Service: DeckGenerationService
Inputs

Sermon (structured fields)

Theme summary (tone/branding constraints, not raw CSS)

Desired deck size

Template pack metadata (what slide types exist)

Outputs

List of slides matching contract

Generation algorithm (MVP)

Decide slide plan (deterministic):

title (1)

scripture (1)

points (N points → 1–2 slides each)

application (1)

invitation (1)

Ask LLM to fill slide content for each slide type with strong constraints:

short lines

bullets max length

no filler

Post-process:

enforce max line length

auto-wrap long bullets into two bullets (optional)

ensure no empty fields

Provider abstraction

LlmClient interface:

generateJson<T>(system, user, schemaHint): Promise<T>

Adapters:

LmStudioClient

OpenAiClient (optional later)

StubClient

Reliability requirements

Must never fail the whole deck due to 1 bad response:

If LLM returns invalid JSON: fallback template filler for that slide

Always return a usable deck.

8) Export Service Spec
PPTX Export (recommended approach)

Use a PPTX library:

Node: pptxgenjs (common)

Map layoutKey → render function

title template

scripture template

point template

application template

Pull theme fonts/colors/logo

Output file → object storage → export record

PDF export (optional in v1)

Either:

render slides to images and stitch PDF

or generate PDF directly with a PDF library (harder to match slide look)

For MVP: PPTX first.

9) Frontend App Spec
Pages
A) Login

email/password

B) Dashboard

“Create New Sermon”

list recent sermons + decks

statuses: generating/ready/exported

C) Sermon Builder (Form)

Fields:

Title

Series

Main scripture reference

Big idea

Main points (add/remove)

Tone dropdown

Audience context textarea

CTA style dropdown
Buttons:

Save draft

Generate Deck (choose theme + deck length)

D) Deck Editor

Left sidebar: slide thumbnails (click to select)
Main: slide preview canvas
Right panel: slide content editor

For each slide type, show appropriate fields (title/subtitle/bullets/lines)
Actions:

Add slide (choose type)

Delete slide

Duplicate slide

Reorder (drag)

Regenerate this slide (v1.5)
Top bar:

Export PPTX

Export PDF (optional)

Theme selector (switch theme and re-render preview)

E) Theme Manager (Admin)

Upload logo

Pick colors

Choose fonts (Google fonts list or limited set)

Preview templates

10) UX Requirements That Make Pastors Actually Use It

These are non-negotiable if you want adoption.

A) It must feel faster than PowerPoint-from-scratch

Generation: show progress (even fake steps)

Editable instantly after generation

B) It must create “slide-looking slides”

So enforce:

short lines

visual rhythm

no paragraphs

one idea per slide

C) Regenerate individual slide

Pastors don’t want to rerun the whole deck.

11) Quality Guardrails (The “Not Generic” Problem)

Add a backend post-processor called SlideQualityGuard.

Rules:

Reject bullets that start with “Join us this Sunday…” (marketing bleed)

Reject repeated phrases across slides

Reject overly generic statements:

“God is with you.”

“Have faith.”
Replace with slightly more specific fallback.

Also enforce:

max characters per line (e.g., 42)

max bullets (e.g., 3)

max bullet length (e.g., 70 chars)