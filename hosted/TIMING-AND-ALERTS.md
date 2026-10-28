# Current platform policy

See [PLATFORM-GUIDE.md](PLATFORM-GUIDE.md) for current multi-clinic access, private capacity and attendance rules. Arrival is 30 minutes early; a missed appointment is Absent with a 30-minute late check-in window, then final Absent. This supersedes the earlier five-minute cancellation prototype.

# Appointment timing and phone alerts

Each consultation averages 15 minutes. Reception controls opening/closing times and the maximum patient count. Both limits apply: a 4–9 PM session fits 20 consultations even if its patient limit is 50. Extend session hours to accommodate a higher limit.

New bookings show estimated consultation time, arrival time (15 minutes earlier), tokens ahead and a reception check-in deadline (consultation time plus five minutes). Phone and address are required. Existing bookings remain intact and are not retroactively subjected to automatic no-show cancellation.

Reception records physical arrival using **Check in**. An unchecked new booking is cancelled once its updated deadline passes. No-show processing pauses while the doctor is on a timed break/delay, the session is finished, or a consultation is still in progress. Complete consultations promptly to keep estimates current. Actual consultation lengths may vary.

Doctor changes apply to the date selected in reception. Enter a break/delay duration or a future resume time. A timed break resumes automatically. Cancellations advance the same-day queue; patients who have not arrived receive at least 15 minutes of lead time. Eligible next-day bookings retain the explicit accept/decline offer workflow.

## Browser notifications

Choose **Enable phone alerts** and allow notifications. Confirmation, arrival reminders, doctor updates, time changes, cancellations and earlier-slot offers are encrypted Web Push messages. DNotifier continues to provide realtime page updates and the administrative AI assistant. Web Push uses the browser's push service because the DNotifier WebSocket connection alone cannot notify a closed mobile browser.

On iOS/iPadOS 16.4+, add the site to the Home Screen and open that installed website before enabling notifications. Permission is requested only after a patient clicks the button. Reception-created bookings must be opened through the private link on the patient's own device before that device can receive alerts. Phone numbers do not cause SMS delivery.

VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are production runtime variables; the private key never reaches the browser or source repository. Push subscriptions and leased delivery jobs are stored durably in D1 with the appointment state. Failed sends retry with backoff (maximum five attempts); expired devices are removed. Superseded time/reminder jobs are skipped. Success means the push service accepted a message, not proof the patient read it. Network, permission, Focus modes and battery restrictions can affect display.

## Unattended processing

Every normal API request performs clock maintenance at most once per 15 seconds, then drains due notification jobs. A cloud scheduler must request `/api/public` every minute to process reminders and no-shows while all pages are closed. This endpoint exposes no patient data and accepts no arbitrary booking changes. Its response includes the last persisted clock tick for verification. An open page also polls every ten seconds. Without a functioning scheduler, closed-page time events wait until the next request; do not represent page polling alone as continuous background execution.

The native Sites scheduler rejected the required minute-level schedule because it permits at most one run per hour. No hourly substitute was created. Continuous unattended timing is therefore NOT enabled in this prototype. Keep reception (or a patient page) open during testing; it polls every ten seconds. For production, connect a trusted minute-level HTTP scheduler to the public maintenance URL, verify lastClockTick with all pages closed, then remove the demo notice. Browser delivery can take longer than the timer interval. Times are estimates and the grace deadline is evaluated against the latest persisted consultation time. Check **Activity & delivery** for accepted, pending and failed push counts.

## Validation

Run `node --test tests/*.test.js`. Tests cover contact validation, 15-minute slot spacing, capacity/closing boundaries, breaks, queue advancement, single reminders, grace-period cancellation, check-in protection, legacy record protection, modern encrypted Web Push payloads and PDF report filtering/privacy. Real device delivery additionally requires notification permission and a valid browser push subscription.
