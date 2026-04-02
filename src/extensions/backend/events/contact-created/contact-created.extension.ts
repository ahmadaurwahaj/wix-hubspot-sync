import { extensions } from '@wix/astro/builders';

export const eventContactCreated = extensions.event({
  id: 'a1d8e3f5-6b9c-4a2d-8e7f-1c3b5d9a7e2f',
  source: './extensions/backend/events/contact-created/contact-created.ts',
});
