# WMP ClinicFlow — hosted website

Patient self-booking and a password-protected reception workspace, built by WMP (Usama, Ayan and Hassaan). The website uses Poppins and Open Sans, an original SVG care-loop identity and the official DNotifier SDK.

## Links

Production origin is recorded in the deployment result. Patient portal `/`; reception `/reception`; brand guide `/brand-guidelines.html`.

Reception → **Clinic profile & link** lets staff update the clinician's display information and copy the public booking link. Reception can also add a booking from Overview. Both flows use the same hosted database and capacity rules.

## Stack

- Vinext / React shell with responsive browser UI.
- Cloudflare Worker API and durable D1 SQL storage.
- Compare-and-swap state revisions prevent capacity races between Workers.
- DNotifier HTTP SDK for authentication, workflow AI and message publishing.
- DNotifier WebSocket SDK for browser-session event delivery, proxied through server SSE so the app secret stays private.
- Polling recovers a missed live refresh. No SMS or WhatsApp integration is claimed.

## Configuration

Runtime secrets are set in Sites, never in this repository: `DNOTIFIER_APP_ID`, `DNOTIFIER_SECRET` (or `DNOTIFIER_APP_SECRET`), `STAFF_PASSWORD`. Optional `DNOTIFIER_AI_PROVIDER` and `DNOTIFIER_AI_MODEL` override the DNotifier project configuration. AI access being enabled does not mean a provider and provider API key have been configured; the UI reports provider errors instead of inventing answers.

The original laptop's ignored `TEAM-ACCESS.txt` holds the reception password. Do not commit this password, runtime secret files, patient access links or database copies.

## Local development

```text
npm install
npm run db:generate   # only for new schema changes; inspect generated migration
npm run dev
```

Use ignored `.dev.vars` for local runtime configuration. The hosting manifest declares the `DB` D1 binding. Build via the Sites skill's `build-site.mjs`; deploy through the supported Sites source/package workflow. Production migrations are applied by the deployment system.

## Test the prototype

1. Reception signs in; set today's capacity to 3 and cutoff later than current PKT time.
2. Patients book three slots. A fourth must confirm the next available day.
3. Next-day patient opts into earlier slots.
4. Reception cancels one of today's waiting bookings.
5. Next-day patient gets an offer. Acceptance changes the appointment atomically; decline/expiry keeps the original booking and advances to the next candidate.
6. Check Activity & delivery for DNotifier accepted/received counters.

Date and offer cutoff use Asia/Karachi. Queue estimates are approximate and start from checked-in patients. Display clinic hours are informational in this prototype. Use fictional patient data for team testing; this is not a clinical records system.

## Brand assets

`public/brand/` contains icon, horizontal, reversed and monochrome SVGs. `public/fonts/` contains the requested font families and their licenses. The public brand guide describes palette, typography, sizing and logo usage.

## GitHub and hosting

The source is mirrored into the user's private GitHub repository. GitHub Pages cannot run this Worker/database/secret-backed API; the working website is published through Sites. DNotifier provides AI and messaging infrastructure; it is not being represented as the website host.

## Public patient website

The homepage is now patient-facing: Book appointment, My appointment, private tracking and clinic help. It does not show a reception/dashboard link, staff delivery counters or team-development controls. Staff continue using the direct `/reception` link and their password. Hiding navigation does not replace authentication; staff APIs remain protected.

## PDF reports

Reception → **Reports & PDF** → choose From date, To date and Appointment status → Preview report or Download PDF. A report supports up to 93 days and 5,000 matching appointments. It contains current appointment status, token, patient name, scheduled date and earlier-alert preference, plus summary counts and page numbers. It is an appointment register, not a medical or billing report.

`GET /api/reports` returns the signed-in report preview; `GET /api/reports/pdf` streams a PDF attachment. Both require the reception session. Downloads are rate-limited, marked private/no-store, and omit access tokens, private URLs and internal booking IDs. Names in Arabic/Urdu use a bundled Noto Sans Arabic fallback. All displayed report times use Asia/Karachi.

Report generation uses PDF-lib plus fontkit because the hosted runtime is JavaScript. The official DNotifier SDK remains responsible for notifications and the clinic assistant. No new patient records or medical notes are collected for reporting.

Validation: `node --test tests/reports.test.js` checks totals, date/status filters, invalid periods and secret exclusion. PDF layout has been rendered and reviewed with an 80-row, five-page sample, long names and Urdu names. An HTTP check verifies public downloads return 401 and a signed-in download starts with a valid PDF header.
