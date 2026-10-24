# WMP ClinicFlow

A clinic operations prototype by **Usama, Ayan and Hassaan**. Daily capacity, private booking tokens, live queues and cancellation recovery, with the official DNotifier SDK.

## Run on Windows

Requires Node.js 24 or newer. Double-click **Start-ClinicFlow.cmd**, or run:

```powershell
npm install
Copy-Item .env.example .env  # only on a fresh clone; never overwrite existing credentials
# Edit .env: DNotifier app ID, app secret and a private STAFF_PASSWORD
npm start
```

Patient portal: http://localhost:4310  
Reception: http://localhost:4310/reception

On the original laptop credentials are already configured in the ignored `.env`. Reception password is in the ignored **TEAM-ACCESS.txt**. Neither file belongs on GitHub.

## Three-person testing

1. Start **one** server on Usama's laptop. Keep it running and keep the laptop awake.
2. All three devices join the same trusted Wi-Fi/hotspot.
3. Use the **Team network** URL printed at startup (not `localhost` on other devices).
4. Ayan opens `/reception` and signs in using the local team password.
5. Usama and Hassaan use the patient portal, preferably in different browser profiles/devices.
6. If the Wi-Fi blocks communication between devices, use a shared hotspot or permitted network. No firewall settings are changed by this project.

Each patient browser stores its private booking key locally. Tracking page → **Open on another device** provides a private link. Anyone holding that link can access that booking; do not post it publicly. The hash is removed immediately after import.

Local HTTP is for fictional-data team testing on a trusted network. A real deployment needs HTTPS, durable hosted storage, proper staff account management, retention policies and clinic approval. This is an administrative prototype; no diagnosis, treatment or medical-priority decisions.

## Five-minute demo

1. Reception: set **today's capacity to 3**, offer expiry **5 minutes**, cutoff later than the current PKT time. For testing, `23:59` works before the final minute of the day.
2. Make three fictional bookings for today.
3. A fourth attempt must suggest the next available date. Patient explicitly confirms the suggested date; enable earlier-slot offers.
4. Make another next-day booking on a different device, also opted in.
5. Cancel one of today's waiting bookings in reception.
6. First eligible next-working-day patient receives the reserved earlier-slot offer.
7. Accept: booking moves to today, a new daily token is assigned, tomorrow's capacity is released.
8. Or decline: original booking stays; the next eligible patient receives the offer.
9. Check in, call and complete a patient from reception. Updates reach the tracking page.
10. Open **Activity & delivery** to see actual DNotifier send/receipt counts. Ask the assistant “Meri appointment kis din hai?” to exercise the AI workflow if enabled.

The queue starts empty. Clinician name, fee, hours and location are explicitly demo details, configured in `clinic.js`. Do not use these as actual medical-provider information.

## Rules

- Default daily limit is 50, with per-date overrides and closed dates.
- Full dates return the next available open day within 90 days. The patient confirms it.
- Completed visits count toward that day's capacity. Cancelled/absent visits do not.
- Cancellation recovery targets opted-in, not-yet-checked-in patients on the **next working day**, ordered by original booking creation time. A patient must be able to arrive by cutoff.
- Offer reservations count against capacity. Offers expire and advance to the next eligible patient.
- Accepting changes the date and token in one SQLite transaction; the booking ID is stable.
- Repeated/expired accept requests cannot duplicate a booking. Original appointments survive declines, expiry and failed transfers.
- Checked-in patients enter the live queue by check-in order. Estimates are rough: ten minutes per checked-in patient plus staff-entered delay. Clinical priority is managed by staff outside this prototype.
- All dates and cutoffs use Asia/Karachi.

## Architecture / DNotifier

This implementation uses lightweight HTML/CSS/JavaScript and Node's HTTP server rather than React/Express. This avoids an extra build step and makes the prototype easy to run. SQLite (Node 24 built-in `node:sqlite`) persists transactional application state in `data/clinic.sqlite`.

```
Browser -> Node API -> SQLite transaction + persistent event outbox
                     -> DNotifier SDK sender
                     -> DNotifier SDK receiver -> safe refresh signal -> browser
Browser -> authorized API -> own booking or staff dashboard
```

Two server-side SDK clients (`clinicflow-server`, `clinicflow-delivery`) route actual event envelopes through DNotifier. Only event ID/type is sent for operations messaging, not names or clinical data. Delivery receipts remove matching outbox entries. Retries may deliver duplicate envelopes; removing by event ID is idempotent. Counters describe messages in the current server session, not unique business events.

Local server-sent events immediately refresh clients after writes. DNotifier receipt also triggers a refresh; ten-second polling recovers missed refreshes. The UI shows DNotifier offline honestly if it is unavailable. Core appointments still work offline from DNotifier. No claim that all local updates traveled through DNotifier.

The patient assistant invokes an actual `DNotifier.Workflow` and `sendAI`, with workflow observability enabled. It receives only administrative clinic settings and that patient's date/token/status, not their name or medical information. The workflow is read-only. If the plan/model is unavailable, an explicit error and a reception handoff button are shown; there are no fabricated AI responses.

In-app notifications require the page to be open. SMS, WhatsApp and background push are not implemented. The reception handoff creates a staff activity item; it is not a full bidirectional human chat yet.

## Files and ownership

- `public/app.js` — patient and reception flows (Usama / Ayan)
- `public/style.css` — responsive teal medical visual system
- `clinic.js` — transactional booking, queue and offers (Hassaan)
- `server.js` — HTTP routes, access control, SSE and background expiry
- `dnotifier.js` — official SDK messaging and AI workflow
- `tests/` — business rules and integration coverage
- `.env.example` — safe configuration template

## Tests

```powershell
npm test
```

Never commit `.env`, `TEAM-ACCESS.txt`, `data/`, database backups or patient links. Use one app server process per SQLite database; this MVP stores a state document inside SQLite and is not a multi-instance hosted database architecture.

## Team collaboration

One repository, branches `patient-ui`, `reception-ui`, `backend`. Agree API fields before changing shared code. Merge and test one vertical flow at a time. Clone on other laptops for development; for a shared live demo use the original laptop's running server, otherwise every clone has its own independent database.

## Next releases

Staff-managed clinician profile and hours enforcement; multiple doctors; production identity and HTTPS; hosted SQL database; SMS/push integration; reliable session reconnection and delivery monitoring; full reception chat; authenticated notification inbox; improved wait-time estimation from actual visit duration.
