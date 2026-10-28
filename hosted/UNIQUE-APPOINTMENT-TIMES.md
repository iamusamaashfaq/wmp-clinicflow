# One consultation time per patient

The current single-doctor clinic reserves one 15-minute interval for each active token. Patient bookings, reception bookings, accepted earlier-slot offers and AI rescheduling all use the same server-side next-free-slot calculation. Assignments use whole minutes in Pakistan time; the same clock time on a different date is allowed.

Booked, checked-in, in-consultation and completed records reserve their assigned interval. Cancelled and final-absent records release it. An absent booking still within its 30-minute late-check-in window continues to reserve its interval. Queue reflow skips completed/consulting intervals, including out-of-order calls and early completions. Automatic clock maintenance also separates overlapping existing waiting appointments for today/future dates, preserving booking IDs, private links and contact information, and queues timing-change notifications. Historical completed records are retained.

Every database mutation validates new or changed appointment intervals before committing. D1 revision compare-and-swap retries concurrent writes against fresh state, so simultaneous requests cannot reserve the same interval. A conflict is rejected rather than persisted. Daily capacity and clinic closing time still apply.

Validation: `node --test tests/*.test.js` includes simultaneous write retries, collision rollback, whole-minute spacing, completed-slot protection, cancellation reuse, AI transfer, queue movement and existing-conflict repair. The live HTTP check creates four simultaneous temporary bookings, reads their persisted private records, verifies distinct 15-minute intervals and cancels the test bookings.
