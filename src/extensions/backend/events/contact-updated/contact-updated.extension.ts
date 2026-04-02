import { extensions } from '@wix/astro/builders';

export const eventContactUpdated = extensions.event({
  id: 'b2e9f4a6-7c0d-4b3e-9f8a-2d4c6e0b8f3a',
  source: './extensions/backend/events/contact-updated/contact-updated.ts',
});
