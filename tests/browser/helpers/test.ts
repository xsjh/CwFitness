import { test as base, expect } from "@playwright/test";

export type { Page } from "@playwright/test";

import { acceptDialogs } from "./workspace";

/**
 * Every browser spec needs `window.confirm`/`window.prompt` to be accepted automatically so
 * Playwright does not block on the dialog. Wiring that here means each spec only needs to
 * import `test` from this module; it never has to remember the `beforeEach(acceptDialogs)`
 * boilerplate.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    acceptDialogs(page);
    // eslint-disable-next-line react-hooks/rules-of-hooks -- `use` here is the Playwright fixture contract, not the React hook.
    await use(page);
  },
});

export { expect };
