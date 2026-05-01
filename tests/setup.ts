import { beforeEach, vi } from 'vitest';

const mockStorage = new Map<string, unknown>();

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
        if (keys === null || keys === undefined) {
          return Object.fromEntries(mockStorage);
        }

        if (typeof keys === 'object' && !Array.isArray(keys)) {
          return Object.fromEntries(
            Object.entries(keys).map(([key, fallback]) => [
              key,
              mockStorage.has(key) ? mockStorage.get(key) : fallback,
            ])
          );
        }

        const keyArray = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(
          keyArray.filter((key) => mockStorage.has(key)).map((key) => [key, mockStorage.get(key)])
        );
      }),
      set: vi.fn(async (items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) {
          mockStorage.set(key, value);
        }
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        for (const key of keyArray) mockStorage.delete(key);
      }),
      clear: vi.fn(async () => {
        mockStorage.clear();
      }),
    },
  },
  alarms: {
    create: vi.fn(),
    onAlarm: {
      addListener: vi.fn(),
    },
  },
  runtime: {
    onInstalled: {
      addListener: vi.fn(),
    },
    onStartup: {
      addListener: vi.fn(),
    },
    onMessage: {
      addListener: vi.fn(),
    },
    sendMessage: vi.fn(async () => ({ ok: true })),
  },
  notifications: {
    create: vi.fn(),
  },
};

beforeEach(() => {
  mockStorage.clear();
  vi.clearAllMocks();
});

export { mockStorage };
