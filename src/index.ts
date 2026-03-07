/**
 * @theluckystrike/content-script-bridge
 * Type-safe bridge for communication between content scripts and page context in Chrome extensions
 */

export type BridgeSide = 'page' | 'content-script';

export interface BridgeMessage<T = unknown> {
  __bridge: string;
  type: string;
  payload: T;
}

export interface Bridge<Messages extends Record<string, unknown>> {
  sendToPage<K extends keyof Messages>(type: K, payload: Messages[K]): void;
  sendToContentScript<K extends keyof Messages>(type: K, payload: Messages[K]): void;
  onMessage<K extends keyof Messages>(type: K, handler: (payload: Messages[K]) => void): () => void;
  destroy(): void;
}

interface ListenerEntry {
  type: string;
  handler: (payload: unknown) => void;
}

/**
 * Creates a type-safe bridge for communication between content scripts and page context
 * @param namespace Unique identifier to prevent message collisions
 * @param side Which side this bridge instance lives on — determines which messages onMessage receives
 */
export function createBridge<Messages extends Record<string, unknown>>(namespace: string, side: BridgeSide): Bridge<Messages> {
  const listeners: ListenerEntry[] = [];
  let messageHandler: ((event: MessageEvent) => void) | null = null;

  // Determine which prefix this side should listen to
  const listenPrefix = side === 'page' ? '__to-page__' : '__to-content__';

  const sendMessage = (direction: 'to-page' | 'to-content', type: string, payload: unknown): void => {
    const message: BridgeMessage = {
      __bridge: namespace,
      type: direction === 'to-page' ? `__to-page__${type}` : `__to-content__${type}`,
      payload,
    };
    window.postMessage(message, window.location.origin);
  };

  const handleIncomingMessage = (event: MessageEvent): void => {
    if (event.source !== window) {
      return;
    }

    const data = event.data;

    if (!data || typeof data !== 'object' || typeof data.__bridge !== 'string' || typeof data.type !== 'string') {
      return;
    }

    // Ignore messages without our bridge namespace
    if (data.__bridge !== namespace) {
      return;
    }

    // Only process messages directed at this side
    if (!data.type.startsWith(listenPrefix)) {
      return;
    }

    const messageType = data.type.slice(listenPrefix.length);

    if (!messageType) {
      return;
    }

    // Find and invoke matching listeners
    const matchingListeners = listeners.filter(listener => listener.type === messageType);
    matchingListeners.forEach(listener => {
      listener.handler(data.payload);
    });
  };

  return {
    sendToPage<K extends keyof Messages>(type: K, payload: Messages[K]): void {
      sendMessage('to-page', type as string, payload);
    },

    sendToContentScript<K extends keyof Messages>(type: K, payload: Messages[K]): void {
      sendMessage('to-content', type as string, payload);
    },

    onMessage<K extends keyof Messages>(type: K, handler: (payload: Messages[K]) => void): () => void {
      // Set up the global message listener on first use
      if (!messageHandler) {
        messageHandler = handleIncomingMessage;
        window.addEventListener('message', messageHandler);
      }

      const entry: ListenerEntry = {
        type: type as string,
        handler: handler as (payload: unknown) => void,
      };
      listeners.push(entry);

      // Return unsubscribe function
      return () => {
        const index = listeners.indexOf(entry);
        if (index > -1) {
          listeners.splice(index, 1);
        }
        // Clean up global listener if no more listeners
        if (listeners.length === 0 && messageHandler) {
          window.removeEventListener('message', messageHandler);
          messageHandler = null;
        }
      };
    },

    destroy(): void {
      // Remove all listeners
      if (messageHandler) {
        window.removeEventListener('message', messageHandler);
        messageHandler = null;
      }
      listeners.length = 0;
    },
  };
}

/**
 * Injects a script element into the page
 * @param scriptUrl URL of the script to inject
 * @returns The created script element
 */
export function injectScript(scriptUrl: string): HTMLScriptElement {
  const script = document.createElement('script');
  script.src = scriptUrl;
  script.type = 'text/javascript';
  script.async = true;
  (document.head || document.documentElement).appendChild(script);
  return script;
}
