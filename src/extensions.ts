import { app } from "@wix/astro/builders";
import overviewPage from "./extensions/dashboard/pages/my-page/my-page.extension.ts";
import connectionPage from "./extensions/dashboard/pages/connection/connection.extension.ts";
import fieldMappingPage from "./extensions/dashboard/pages/field-mapping/field-mapping.extension.ts";
import syncStatusPage from "./extensions/dashboard/pages/sync-status/sync-status.extension.ts";
import { eventFormSubmitted } from "./extensions/backend/events/form-submitted/form-submitted.extension.ts";
import { eventContactCreated } from "./extensions/backend/events/contact-created/contact-created.extension.ts";
import { eventContactUpdated } from "./extensions/backend/events/contact-updated/contact-updated.extension.ts";
import { dataExtension } from "./extensions/data/extensions.ts";

export default app()
  .use(overviewPage)
  .use(connectionPage)
  .use(fieldMappingPage)
  .use(syncStatusPage)
  .use(eventFormSubmitted)
  .use(eventContactCreated)
  .use(eventContactUpdated)
  .use(dataExtension);
