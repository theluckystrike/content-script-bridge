// Chrome API mock setup for testing
// Uses a minimal mock that covers storage, runtime, tabs, alarms
// Add more API mocks here as needed

// Event listener storage for mocking addEventListener/removeEventListener
const eventListeners = new Map<string, Set<(...args: unknown[]) => void>>();

const createStorageArea = (): Record<string, unknown> => {
  const store: Record<string, unknown> = {};
  return {
    get: vi.fn((keys: string | string[]) => {
      if (typeof keys === 'string') return Promise.resolve({ [keys]: store[keys] });
      const result: Record<string, unknown> = {};
      (Array.isArray(keys) ? keys : [keys]).forEach(k => { result[k] = store[k]; });
      return Promise.resolve(result);
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      Object.assign(store, items);
      return Promise.resolve();
    }),
    remove: vi.fn((keys: string | string[]) => {
      (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]);
      return Promise.resolve();
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach(k => delete store[k]);
      return Promise.resolve();
    }),
    _store: store,
  };
};

const chromeMock = {
  storage: {
    local: createStorageArea(),
    sync: createStorageArea(),
    session: createStorageArea(),
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
    },
  },
  runtime: {
    sendMessage: vi.fn(() => Promise.resolve()),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
      hasListener: vi.fn(() => false),
    },
    getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
    id: 'mock-extension-id',
    lastError: null as chrome.runtime.LastError | null,
  },
  tabs: {
    query: vi.fn(() => Promise.resolve([])),
    create: vi.fn(() => Promise.resolve({ id: 1 })),
    update: vi.fn(() => Promise.resolve({})),
    remove: vi.fn(() => Promise.resolve()),
    sendMessage: vi.fn(() => Promise.resolve()),
    onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  alarms: {
    create: vi.fn(() => Promise.resolve()),
    get: vi.fn(() => Promise.resolve(null)),
    getAll: vi.fn(() => Promise.resolve([])),
    clear: vi.fn(() => Promise.resolve(true)),
    clearAll: vi.fn(() => Promise.resolve(true)),
    onAlarm: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  contextMenus: {
    create: vi.fn(() => 'mock-menu-id'),
    update: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve()),
    removeAll: vi.fn(() => Promise.resolve()),
    onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  notifications: {
    create: vi.fn(() => Promise.resolve('mock-notif-id')),
    clear: vi.fn(() => Promise.resolve(true)),
    onClicked: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  permissions: {
    request: vi.fn(() => Promise.resolve(true)),
    remove: vi.fn(() => Promise.resolve(true)),
    contains: vi.fn(() => Promise.resolve(false)),
    getAll: vi.fn(() => Promise.resolve({ permissions: [], origins: [] })),
    onAdded: { addListener: vi.fn(), removeListener: vi.fn() },
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
  },
};

// Install globally
Object.defineProperty(globalThis, 'chrome', {
  value: chromeMock,
  writable: true,
  configurable: true,
});

// Helper to reset all mocks between tests
export function resetChromeMocks(): void {
  vi.clearAllMocks();
  chromeMock.storage.local._store && Object.keys(chromeMock.storage.local._store).forEach(k => delete (chromeMock.storage.local._store as Record<string, unknown>)[k]);
  chromeMock.storage.sync._store && Object.keys(chromeMock.storage.sync._store).forEach(k => delete (chromeMock.storage.sync._store as Record<string, unknown>)[k]);
}

// Mock window and document globals for browser API tests
const windowMock = {
  location: {
    origin: 'http://localhost:3000',
  },
  postMessage: vi.fn(),
  addEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!eventListeners.has(event)) {
      eventListeners.set(event, new Set());
    }
    (eventListeners.get(event) as Set<(...args: unknown[]) => void>).add(handler);
  }),
  removeEventListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    const handlers = eventListeners.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }),
};

const documentMock = {
  createElement: vi.fn((tagName: string) => {
    if (tagName === 'script') {
      return {
        src: '',
        type: 'text/javascript',
        async: true,
      };
    }
    return {};
  }),
  head: {
    appendChild: vi.fn(),
  },
};

// Install window and document globally
Object.defineProperty(globalThis, 'window', {
  value: windowMock,
  writable: true,
  configurable: true,
});

Object.defineProperty(globalThis, 'document', {
  value: documentMock,
  writable: true,
  configurable: true,
});

// Export helper to get stored event listeners (for testing)
export function getEventListeners(event: string): Set<(...args: unknown[]) => void> {
  return eventListeners.get(event) || new Set();
}

export function clearEventListeners(): void {
  eventListeners.clear();
}
