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
