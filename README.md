# @theluckystrike/content-script-bridge

<div align="center">

![Zovo](https://img.shields.io/badge/⚡-Zovo-blue?style=for-the-badge&labelColor=1a1a2e)

**Type-safe bridge for communication between content scripts and page context in Chrome extensions.**

[![npm version](https://img.shields.io/npm/v/@theluckystrike/content-script-bridge)](https://www.npmjs.com/package/@theluckystrike/content-script-bridge)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

**Built with ❤️ by [theluckystrike](https://github.com/theluckystrike) at [Zovo](https://zovo.one)**

</div>

## Why This Library?

Chrome extensions face a unique challenge: content scripts run in an isolated world, separate from the page's JavaScript context. While `chrome.runtime.sendMessage` and `chrome.runtime.onMessage` work well for communication between the background script and content scripts, communicating with scripts injected into the page context requires a different approach.

This library provides **type-safe messaging** between content scripts and page-injected scripts using `window.postMessage`, with full TypeScript support to ensure your message types are consistent across both contexts.

### Key Features

- **Type Safety**: Full TypeScript generics ensure you can't send or receive messages with the wrong payload shape
- **Namespace Isolation**: Prevents message collisions when multiple extensions use this library
- **Zero Dependencies**: Lightweight with no runtime dependencies
- **Request/Response Patterns**: Built-in support for async request-response communication
- **Streaming Support**: Handle continuous message streams from page to extension
- **Clean API**: Simple, intuitive API that gets out of your way

## Install

```bash
npm install @theluckystrike/content-script-bridge
```

```bash
pnpm add @theluckystrike/content-script-bridge
```

```bash
yarn add @theluckystrike/content-script-bridge
```

## Quick Start

### 1. Define Your Message Types

First, define a type that describes all possible messages in your extension:

```typescript
// messages.ts - shared between content script and injected script
export type MyMessages = {
  // From content script to page
  fetchUserData: { userId: string };
  
  // From page to content script
  userDataResponse: { userId: string; name: string; email: string };
  
  // Streaming: page sends updates to content script
  progressUpdate: { percent: number; status: string };
  
  // Error case
  error: { code: string; message: string };
};
```

### 2. Set Up the Bridge in Your Content Script

```typescript
import { createBridge, injectScript } from '@theluckystrike/content-script-bridge';
import type { MyMessages } from './messages';

// Create a bridge instance in your content script
const bridge = createBridge<MyMessages>('my-extension', 'content-script');

// Listen for messages from the page
bridge.onMessage('userDataResponse', (payload) => {
  console.log('Received user data:', payload.name);
});

bridge.onMessage('progressUpdate', (payload) => {
  console.log(`Progress: ${payload.percent}% - ${payload.status}`);
});

// Send a request to the page
bridge.sendToPage('fetchUserData', { userId: '123' });

// Inject your page script
injectScript(chrome.runtime.getURL('injected.js'));

// Clean up when your content script unloads
window.addEventListener('unload', () => {
  bridge.destroy();
});
```

### 3. Set Up the Bridge in Your Injected Script

```typescript
import { createBridge } from '@theluckystrike/content-script-bridge';
import type { MyMessages } from './messages';

// Create a bridge instance in the page context
const bridge = createBridge<MyMessages>('my-extension', 'page');

// Listen for messages from the content script
bridge.onMessage('fetchUserData', async (payload) => {
  try {
    // Simulate fetching data
    const userData = await fetchUserFromAPI(payload.userId);
    
    // Send response back to content script
    bridge.sendToContentScript('userDataResponse', {
      userId: payload.userId,
      name: userData.name,
      email: userData.email,
    });
  } catch (error) {
    // Handle errors gracefully
    bridge.sendToContentScript('error', {
      code: 'FETCH_FAILED',
      message: error.message,
    });
  }
});

// Simulated API call
async function fetchUserFromAPI(userId: string) {
  // Your API logic here
  return { name: 'John Doe', email: 'john@example.com' };
}
```

## Type-Safe Messaging

The library uses TypeScript generics to ensure compile-time type safety:

```typescript
type Messages = {
  getConfig: void;           // No payload needed
  configResponse: { theme: 'light' | 'dark'; lang: string };
};

// This is type-checked at compile time!
bridge.onMessage('configResponse', (payload) => {
  // payload is typed as { theme: 'light' | 'dark'; lang: string }
  console.log(payload.theme);
});

// Invalid: TypeScript will error
bridge.onMessage('configResponse', (payload) => {
  console.log(payload.unknownProperty); // ❌ Property 'unknownProperty' does not exist
});
```

## Request/Response Patterns

### Simple Request-Response

```typescript
// content-script side
const bridge = createBridge<Messages>('my-app', 'content-script');

// Set up a one-time handler for the response
bridge.onMessage('configResponse', (config) => {
  console.log('Got config:', config);
  // Note: In production, consider using a promise-based approach
});

bridge.sendToPage('getConfig', undefined);
```

### Promise-Based Wrapper

For a more ergonomic async API, wrap the bridge:

```typescript
function createRequester<Messages>() {
  const bridge = createBridge<Messages>('my-app', 'content-script');
  
  return {
    request<K extends keyof Messages>(
      type: K, 
      payload: Messages[K] | undefined
    ): Promise<Messages[K]> {
      return new Promise((resolve) => {
        const unsubscribe = bridge.onMessage(type as string, (payload) => {
          unsubscribe();
          resolve(payload as Messages[K]);
        });
        
        // Set timeout to reject promise after 5 seconds
        setTimeout(() => {
          unsubscribe();
          reject(new Error(`Timeout waiting for ${type}`));
        }, 5000);
        
        bridge.sendToPage(type, payload);
      });
    },
    
    on<K extends keyof Messages>(type: K, handler: (payload: Messages[K]) => void) {
      return bridge.onMessage(type, handler);
    },
  };
}

// Usage
const api = createRequester<MyMessages>();
const config = await api.request('getConfig', undefined);
```

## Streaming Messages

The bridge supports streaming patterns where the page continuously sends updates:

```typescript
// content-script side
const bridge = createBridge<Messages>('my-app', 'content-script');

bridge.onMessage('progressUpdate', (payload) => {
  updateProgressBar(payload.percent);
  if (payload.percent >= 100) {
    console.log('Completed:', payload.status);
  }
});

bridge.sendToPage('startLongTask', { taskId: 'abc-123' });

// page side
bridge.onMessage('startLongTask', async (payload) => {
  const totalSteps = 10;
  
  for (let i = 1; i <= totalSteps; i++) {
    // Do some work...
    await doStep(i);
    
    // Stream progress back
    bridge.sendToContentScript('progressUpdate', {
      percent: (i / totalSteps) * 100,
      status: `Step ${i} of ${totalSteps}`,
    });
  }
});

async function doStep(step: number) {
  return new Promise(resolve => setTimeout(resolve, 100));
}
```

## Error Handling

### Basic Error Handling

```typescript
// Set up a catch-all error handler
bridge.onMessage('error', (error) => {
  console.error('Error from page:', error.code, error.message);
  handleError(error);
});

// Or handle errors inline
bridge.onMessage('dataResponse', (payload) => {
  if ('error' in payload && payload.error) {
    console.error('Operation failed:', payload.error);
    return;
  }
  // Process successful response
});
```

### Using Result Types

For more robust error handling, use discriminated unions:

```typescript
type ApiResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };

type Messages = {
  fetchData: { id: string };
  dataResponse: ApiResponse<{ items: string[] }>;
};

// In the page script
bridge.onMessage('fetchData', (payload) => {
  const result = await fetchData(payload.id);
  
  if (result.ok) {
    bridge.sendToContentScript('dataResponse', {
      success: true,
      data: { items: result.data },
    });
  } else {
    bridge.sendToContentScript('dataResponse', {
      success: false,
      error: { code: result.errorCode, message: result.message },
    });
  }
});
```

## Background Script Communication

While this library focuses on content-script to page communication, you can combine it with Chrome's `chrome.runtime` messaging for full extension communication:

```typescript
// content-script.ts - bridges both worlds
import { createBridge, injectScript } from '@theluckystrike/content-script-bridge';

// Bridge to page scripts
const pageBridge = createBridge<PageMessages>('my-extension', 'content-script');

// Listen for messages from background via chrome.runtime
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'fetchFromPage') {
    pageBridge.sendToPage('getData', message.payload);
    
    // Forward response back to background
    pageBridge.onMessage('dataResponse', (data) => {
      sendResponse(data);
    });
    
    return true; // Keep message channel open for async response
  }
});

// Inject page script
injectScript(chrome.runtime.getURL('injected.js'));
```

## API Reference

### `createBridge<Messages>(namespace, side): Bridge<Messages>`

Creates a type-safe bridge instance for cross-context communication via `window.postMessage`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `namespace` | `string` | Unique identifier to prevent message collisions between extensions |
| `side` | `BridgeSide` | Which side this bridge lives on: `'page'` or `'content-script'` |

Returns a `Bridge<Messages>` object with the following methods:

#### `bridge.sendToPage<K>(type, payload): void`

Sends a message to the page-side bridge.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `K extends keyof Messages` | The message type key |
| `payload` | `Messages[K]` | The message payload |

#### `bridge.sendToContentScript<K>(type, payload): void`

Sends a message to the content-script-side bridge.

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `K extends keyof Messages` | The message type key |
| `payload` | `Messages[K]` | The message payload |

#### `bridge.onMessage<K>(type, handler): () => void`

Registers a handler for a specific message type. Only receives messages directed at this side (page bridges receive `sendToPage` messages, content-script bridges receive `sendToContentScript` messages).

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | `K extends keyof Messages` | The message type to listen for |
| `handler` | `(payload: Messages[K]) => void` | Callback function invoked when message is received |

Returns an unsubscribe function that removes the listener when called.

#### `bridge.destroy(): void`

Removes all listeners and cleans up the bridge instance. Call this when your script unloads to prevent memory leaks.

### `injectScript(scriptUrl): HTMLScriptElement`

Injects a `<script>` element into the page's `<head>`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `scriptUrl` | `string` | URL of the script to inject |

Returns the created `HTMLScriptElement`.

### Types

```typescript
type BridgeSide = 'page' | 'content-script';

interface BridgeMessage<T = unknown> {
  __bridge: string;
  type: string;
  payload: T;
}

interface Bridge<Messages extends Record<string, unknown>> {
  sendToPage<K extends keyof Messages>(type: K, payload: Messages[K]): void;
  sendToContentScript<K extends keyof Messages>(type: K, payload: Messages[K]): void;
  onMessage<K extends keyof Messages>(type: K, handler: (payload: Messages[K]) => void): () => void;
  destroy(): void;
}
```

## Best Practices

### 1. Use a Shared Types File

Create a single source of truth for your message types that both your content script and injected script can import:

```typescript
// types/messages.ts
export type ExtensionMessages = {
  // Define all message types here
  getUser: { userId: string };
  userResponse: { user: User };
  error: { code: string; message: string };
};
```

### 2. Always Clean Up

```typescript
// Clean up when the page unloads or your extension context is destroyed
window.addEventListener('unload', () => {
  bridge.destroy();
});

// Or when using in a React/Fraamework component
useEffect(() => {
  return () => bridge.destroy();
}, []);
```

### 3. Use Namespaces to Avoid Conflicts

If you have multiple extensions or need to coexist with other libraries, use unique namespaces:

```typescript
// Your extension
const bridge = createBridge<Messages>('my-unique-app-id', 'content-script');

// Avoid generic names like 'bridge' or 'messages'
```

### 4. Validate Incoming Data

Even with type safety, validate data from the page context:

```typescript
bridge.onMessage('dataResponse', (payload) => {
  // Always validate external data
  if (!payload || typeof payload !== 'object') {
    console.warn('Invalid payload received');
    return;
  }
  
  // Now use the payload safely
  processData(payload);
});
```

## Browser Support

- Chrome 80+
- Firefox 75+
- Edge 80+
- Safari 14.1+

Requires support for `window.postMessage` and ES2015+ features.

## Zovo

This library is maintained by **[theluckystrike](https://github.com/theluckystrike)** and is part of the [Zovo](https://zovo.one) ecosystem of open-source tools for browser extension development.

Visit [zovo.one](https://zovo.one) to discover more extensions and developer tools.

## License

MIT © [theluckystrike](https://github.com/theluckystrike) | [Zovo](https://zovo.one)
