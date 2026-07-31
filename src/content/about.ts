/**
 * The About copy, in one place.
 *
 * Wingman is client-rendered, so anything that only mounts when a visitor opens
 * the About modal is invisible to crawlers that do not execute JavaScript. The
 * same copy is therefore also served as static HTML in index.html, and
 * about.test.ts fails if the two drift apart.
 */

export interface EcosystemLink {
  label: string;
  href: string;
  description: string;
}

export interface CommunityLink {
  label: string;
  href: string;
}

export const WINGMAN_REPO = 'https://github.com/mnfst/wingman';
export const MANIFEST_URL = 'https://manifest.build';
export const MANIFEST_REPO = 'https://github.com/mnfst/manifest';
export const LICENSE_URL = `${WINGMAN_REPO}/blob/main/LICENSE`;
export const ISSUES_URL = `${WINGMAN_REPO}/issues/new`;
export const DISCUSSIONS_URL = `${WINGMAN_REPO}/discussions`;

export const TAGLINE = 'Postman for LLM APIs. A simple yet powerful tool to test LLM APIs.';

export const DOES_HEADING = 'What it does';

export const DOES: string[] = [
  'Send messages to LLM providers',
  'Edit system prompts or choose among popular ones',
  'Allows quick testing and error debugging',
];

export const DOES_NOT_HEADING = 'What it does not';

export const DOES_NOT: string[] = [
  "Store your data: prompts, keys or responses (it's only a frontend)",
  'Persist history and API keys between sessions',
  'Serves as a chat assistant',
];

export const LICENSE_NOTE =
  'Wingman is free and open source software (FOSS) under MIT license. Made for the community by the community. If you think that it deserves more highlight, share it with your peers and give us a star on GitHub.';

export const STAR_CTA = 'Star Wingman on GitHub';

/** Where a bug report or a question goes — the two things the star button isn't. */
export const COMMUNITY: CommunityLink[] = [
  { label: 'Report an issue', href: ISSUES_URL },
  { label: 'Start a discussion', href: DISCUSSIONS_URL },
];

export const ECOSYSTEM_HEADING = 'The Manifest ecosystem';

// Split around the product name so "Manifest" can carry a link to its site
// while the ecosystem list below points at the repositories. Joined back into
// ECOSYSTEM_INTRO for the copy test, which compares rendered text.
export const ECOSYSTEM_INTRO_BEFORE = 'Wingman is part of the ';
export const ECOSYSTEM_INTRO_LINK = 'Manifest';
export const ECOSYSTEM_INTRO_AFTER = ' ecosystem, checkout our other open source repositories:';

export const ECOSYSTEM_INTRO = `${ECOSYSTEM_INTRO_BEFORE}${ECOSYSTEM_INTRO_LINK}${ECOSYSTEM_INTRO_AFTER}`;

export const ECOSYSTEM: EcosystemLink[] = [
  {
    label: 'Manifest',
    href: MANIFEST_REPO,
    description: 'Open-source LLM gateway',
  },
  {
    label: 'Free LLM APIs',
    href: 'https://github.com/mnfst/awesome-free-llm-apis',
    description: 'Awesome list of LLM APIs with permanent free tiers',
  },
  {
    label: 'modelparams.dev',
    href: 'https://github.com/mnfst/modelparams.dev',
    description: 'Open-source AI model parameters database',
  },
  {
    label: 'modeldeprecations.dev',
    href: 'https://github.com/mnfst/modeldeprecations.dev',
    description: 'Open-source AI model deprecations database',
  },
];
