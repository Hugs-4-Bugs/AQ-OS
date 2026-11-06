// Regression test for ISSUE-007: Agents page lazy-loading error
// Verifies that all lazy-loaded dashboard tab components have default exports
// (React.lazy requires a default export — named-only exports cause
// "Element type is invalid. Received a promise that resolves to: undefined.")
//
// This test reads the source files directly (not via import) because
// the components have React/JSX dependencies that cannot be resolved
// in a plain Node test environment.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const COMPONENTS_DIR = join(__dirname, '..', '..', 'src', 'components', 'dashboard');

const LAZY_TABS = [
  'overview-tab',
  'leads-tab',
  'pipeline-tab',
  'discover-tab',
  'outreach-tab',
  'messaging-tab',
  'assistant-tab',
  'insights-tab',
  'deals-tab',
  'competitor-tab',
  'settings-shell',
  'workflows-tab',
  'autopilot-tab',
  'agents-tab',
  'notifications-tab',
];

describe('ISSUE-007: All lazy-loaded dashboard tabs have default exports', () => {
  for (const tabName of LAZY_TABS) {
    it(`${tabName}.tsx should have a default export`, () => {
      const filePath = join(COMPONENTS_DIR, `${tabName}.tsx`);
      const source = readFileSync(filePath, 'utf-8');

      // React.lazy(() => import('./xxx-tab')) requires the module to have
      // a default export. Check for "export default" in the source.
      expect(
        source.includes('export default'),
        `${tabName}.tsx must contain "export default" for React.lazy to work`
      ).toBe(true);
    });
  }

  it('agents-tab.tsx specifically must have a default export (ISSUE-007 regression)', () => {
    const filePath = join(COMPONENTS_DIR, 'agents-tab.tsx');
    const source = readFileSync(filePath, 'utf-8');
    expect(source.includes('export default')).toBe(true);
  });
});
