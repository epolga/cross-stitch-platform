import { afterEach, vi } from 'vitest';

afterEach(() => {
  // Ensure mocks don't leak across tests.
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
