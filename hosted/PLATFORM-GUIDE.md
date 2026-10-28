# WMP ClinicFlow: clinic subscription platform

## WMP owner / admin

Open `/admin`. The initial owner account uses the private production runtime values `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` to initialize once. The password is hashed before storage. There is no public registration. The owner creates individual WMP admin accounts under **WMP admin team**. New credentials appear once and can be downloaded privately. Admin accounts can manage clinic profiles and subscriptions; only the owner can add, disable or reset other admin accounts.

Choose **Create clinic**, enter the clinic name, unique link name, doctor, address, contact details, fee and default daily patient limit. Set the subscription plan, access status and valid-through date. Saving creates:

- Patient booking: `/c/<clinic-link-name>`
- Reception: `/c/<clinic-link-name>/reception`
- A generated reception username and strong password, shown once.

Use **Edit profile / access** to renew or suspend a clinic. Expired/suspended subscriptions are denied by the server. Amounts are manual subscription records; this version does not collect online payments. Password resets revoke reception sessions. Clinic link names remain stable when names/details are edited.

## Reception

Use the generated clinic-specific reception link and credentials. Reception sees booked/remaining counts and patient contact details. A clinic's sessions, appointments, realtime receivers and notification jobs are isolated from other clinics. Patient links are public; reception and WMP admin routes require their respective logins.

In **Daily settings**, select either **This date only** or **Daily limit for this month**. Monthly limits are daily defaults for that month, not a total monthly booking quota. Explicit daily exceptions take priority. Opening/closing times and the 15-minute consultation interval still bound available slots; a 16:00–21:00 session fits 20 consultations even if the patient limit is 50.

## Patient arrival and timing

Appointment and arrival times use 24-hour Pakistan time. A live waiting countdown shows hours, minutes and seconds. Patient responses do not expose booked totals, available-slot counts, clinic capacity or tokens ahead; these are reception-only. The AI context also excludes those internal counts.

Patients should arrive **30 minutes before** their updated consultation time and tell reception. Only reception records check-in. If a new booking has no check-in when the consultation time is reached, it is marked **Absent**, while remaining eligible for late check-in for a further **30 minutes**. Reception can check the patient in during that window and decide when the doctor can see the late arrival. At the end of the window it becomes final Absent and cannot be checked in against that booking. Checked-in patients are not automatically marked absent. Queue updates do not extend a missed patient's grace window. Doctor delays/breaks adjust future consultation times.

Booking IDs/private keys and browser storage are scoped to a clinic. Browser push links return to the correct clinic. The patient AI can cancel or reschedule that patient's own waiting booking, with changes reflected in reception automatically. Each doctor/date/15-minute slot remains unique.

## Runtime and validation

Use migrations generated from `db/schema.ts`; no table creation happens in request handlers. Existing single-clinic data is retained. New clinic data lives in tenant-scoped tables with revision-checked transactions. Admin passwords use PBKDF2; session tokens are hashed, cookies are HttpOnly/SameSite Strict, and login requests are rate limited.

Run `node --test tests/*.test.js`. The HTTP integration test verifies onboarding, clinic isolation, generated reception access, public count privacy, monthly limits, private PDF reporting and reset-session revocation. Verify the UI on a phone before onboarding paying clinics.

The previously identified background scheduling limitation remains: timed reminders and attendance maintenance need an active patient/reception request or an external minute-level maintenance scheduler. This hosting's native hourly scheduler cannot provide continuous minute-level operation. Do not promise unattended 24/7 timed reminders until that scheduler is connected and verified. Browser push delivery also depends on device permission and network.
