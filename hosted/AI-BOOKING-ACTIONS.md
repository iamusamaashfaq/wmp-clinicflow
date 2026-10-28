# Patient self-service through the AI assistant

In **My appointment**, the patient can explicitly ask the DNotifier-powered assistant to cancel their booking or move it to a specified available date. No reception approval is required. Examples: `Cancel my booking`, `Meri booking kal par shift kar do`, or `Reschedule my appointment to 2026-11-02`.

The assistant produces a constrained action plan; server code validates it and performs the database transaction. Only the booking identified by the patient's private link/key can be changed. The AI receives administrative appointment context, not contact details, private keys or other patients' records. Staff sign-in alone cannot authorize an assistant action on behalf of an unrelated patient.

Missing or ambiguous dates prompt clarification. Questions and negated/hypothetical instructions do not change bookings. Only the next available slot on a selected day is supported; specific clock-time requests require clarification. Full/closed destinations preserve the original booking and suggest an available date. In-progress and finished consultations cannot be rescheduled; cancelled records cannot be revived.

Transfers retain the same booking ID, private link, phone/address and notification subscriptions, allocate a token on the destination date, reset check-in, recalculate 30-minute-early arrival and 30-minute late-check-in times, invalidate outstanding earlier-slot offers and advance the original day's queue. Repeated request IDs do not repeat the action. The server's transaction result, rather than AI-generated success text, determines the confirmation shown to the patient.

DNotifier publishes the resulting refresh signal; reception reads the same shared database and sees updated status/date without taking action. Browser push uses the existing delivery queue. The previously documented continuous-background-timer limitation remains unchanged.

Validation: `node --test tests/*.test.js` covers transfer integrity, full-day rollback, cancellation, duplicate requests, unchanged questions, terminal-state protection and action schema validation, plus existing timing, PDF and push checks.

Current patient context excludes clinic capacity, booked/remaining totals and tokens ahead. See PLATFORM-GUIDE.md for multi-clinic links and WMP admin management.
