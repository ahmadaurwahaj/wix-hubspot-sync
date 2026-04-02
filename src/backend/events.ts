/**
 * DEPRECATED: Event handlers have been moved to proper Wix CLI event extensions.
 *
 * Event handlers are now registered via extensions.event() in:
 *   - src/extensions/backend/events/form-submitted/form-submitted.ts
 *   - src/extensions/backend/events/contact-created/contact-created.ts
 *   - src/extensions/backend/events/contact-updated/contact-updated.ts
 *
 * These are registered in src/extensions.ts and use the official Wix SDK event APIs:
 *   - submissions.onSubmissionCreated (@wix/forms)
 *   - contacts.onContactCreated (@wix/crm)
 *   - contacts.onContactUpdated (@wix/crm)
 */
