# @theluckystrike/content-script-bridge

Type-safe bridge for communication between content scripts and page context in Chrome extensions.

[![npm version](https://img.shields.io/npm/v/@theluckystrike/content-script-bridge)](https://www.npmjs.com/package/@theluckystrike/content-script-bridge)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Install

```bash
npm install @theluckystrike/content-script-bridge
```

## Usage

```typescript
import { createBridge, injectScript } from '@theluckystrike/content-script-bridge';

// Define your message types
type Messages = {
  userLoggedIn: { userId: string; username: string };
  fetchData: { query: string };
  dataResponse: { data: number[] };
};

// In your content script
const contentBridge = createBridge<Messages>('my-extension', 'content-script');

contentBridge.onMessage('dataResponse', (payload) => {
  console.log('Received data:', payload.data);
});

contentBridge.sendToPage('fetchData', { query: 'users' });

// In your injected page script
const pageBridge = createBridge<Messages>('my-extension', 'page');

pageBridge.onMessage('fetchData', (payload) => {
  const results = [1, 2, 3];
  pageBridge.sendToContentScript('dataResponse', { data: results });
});

// Inject a script into the page context
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

#### `bridge.sendToContentScript<K>(type, payload): void`

Sends a message to the content-script-side bridge.

#### `bridge.onMessage<K>(type, handler): () => void`

Registers a handler for a specific message type. Only receives messages directed at this side (page bridges receive `sendToPage` messages, content-script bridges receive `sendToContentScript` messages). Returns an unsubscribe function.

#### `bridge.destroy(): void`

Removes all listeners and cleans up the bridge instance.

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

## License

MIT - Built by [theluckystrike](https://github.com/theluckystrike) | [zovo.one](https://zovo.one)
