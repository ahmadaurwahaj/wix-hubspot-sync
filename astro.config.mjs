// @ts-check
import { defineConfig } from 'astro/config';
import wix from '@wix/astro';
import react from "@astrojs/react";
import cloudflare from "@astrojs/cloudflare";

/** Injects the HubSpot OAuth callback under /_wix/extensions/ so the
 *  @wix/astro auth middleware skips it (no generateVisitorTokens call). */
function hubspotCallbackRoute() {
  return {
    name: 'hubspot-callback-route',
    hooks: {
      'astro:config:setup'({ injectRoute }) {
        injectRoute({
          pattern: '/_wix/extensions/hubspot-callback',
          entrypoint: './src/pages/_wix/extensions/hubspot-callback.ts',
        });
      },
    },
  };
}

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  integrations: [wix(), react(), hubspotCallbackRoute()],
  image: { domains: ["static.wixstatic.com"] },
  security: { checkOrigin: false },
  devToolbar: { enabled: false }
});
