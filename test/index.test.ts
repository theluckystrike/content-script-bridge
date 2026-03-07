/**
 * @theluckystrike/content-script-bridge
 * Tests for type-safe bridge between content scripts and page context
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createBridge, injectScript } from '../src/index';
import { clearEventListeners } from './setup';

describe('content-script-bridge', () => {
  // Store references to the global mocks
  let mockPostMessage: ReturnType<typeof vi.fn>;
  let mockAddEventListener: ReturnType<typeof vi.fn>;
  let mockRemoveEventListener: ReturnType<typeof vi.fn>;
  let mockCreateElement: ReturnType<typeof vi.fn>;
  let mockHeadAppendChild: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Clear any previous event listeners
    clearEventListeners();

    // Get references to the global mocks
    mockPostMessage = (window as unknown as { postMessage: ReturnType<typeof vi.fn> }).postMessage;
    mockAddEventListener = (window as unknown as { addEventListener: ReturnType<typeof vi.fn> }).addEventListener;
    mockRemoveEventListener = (window as unknown as { removeEventListener: ReturnType<typeof vi.fn> }).removeEventListener;
    mockCreateElement = (document as unknown as { createElement: ReturnType<typeof vi.fn> }).createElement;
    mockHeadAppendChild = (document.head as unknown as { appendChild: ReturnType<typeof vi.fn> }).appendChild;

    // Clear mocks between tests
    vi.clearAllMocks();
  });

  afterEach(() => {
    clearEventListeners();
  });

  // Helper to simulate receiving a message
  const simulateMessage = (data: Record<string, unknown>, origin: string = '*'): void => {
    const handlers = mockAddEventListener.mock.calls.filter(call => call[0] === 'message');
    handlers.forEach(call => {
      const handler = call[1] as (event: MessageEvent) => void;
      const event = {
        data,
        origin,
        source: window,
      } as unknown as MessageEvent;
      handler(event);
    });
  };

  describe('createBridge', () => {
    it('should create a bridge with the given namespace', (): void => {
      const bridge = createBridge('test-namespace');

      expect(bridge).toBeDefined();
      expect(typeof bridge.sendToPage).toBe('function');
      expect(typeof bridge.sendToContentScript).toBe('function');
      expect(typeof bridge.onMessage).toBe('function');
      expect(typeof bridge.destroy).toBe('function');
    });

    it('should send messages to page with correct namespace', (): void => {
      const bridge = createBridge('my-extension');

      bridge.sendToPage('greet' as keyof { greet: string }, 'Hello World');

      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      const [message, targetOrigin] = mockPostMessage.mock.calls[0] as [Record<string, unknown>, string];
      expect(message.__bridge).toBe('my-extension');
      expect(message.type).toBe('__to-page__greet');
      expect(message.payload).toBe('Hello World');
      expect(targetOrigin).toBe('*');
    });

    it('should send messages to content script with correct namespace', (): void => {
      const bridge = createBridge('my-extension');

      bridge.sendToContentScript('response' as keyof { response: string }, { status: 'ok' });

      expect(mockPostMessage).toHaveBeenCalledTimes(1);
      const [message, targetOrigin] = mockPostMessage.mock.calls[0] as [Record<string, unknown>, string];
      expect(message.__bridge).toBe('my-extension');
      expect(message.type).toBe('__to-content__response');
      expect(message.payload).toEqual({ status: 'ok' });
      expect(targetOrigin).toBe('*');
    });

    it('should ignore messages from other namespaces', (): void => {
      const bridge = createBridge('my-extension');
      const handler = vi.fn();

      bridge.onMessage('test' as keyof { test: string }, handler);

      // Simulate a message from a different namespace
      simulateMessage({
        __bridge: 'other-namespace',
        type: '__to-page__test',
        payload: 'should be ignored',
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it('should route messages to correct handler by type', (): void => {
      const bridge = createBridge('my-extension');
      const handlerA = vi.fn();
      const handlerB = vi.fn();

      bridge.onMessage('actionA' as keyof { actionA: string }, handlerA);
      bridge.onMessage('actionB' as keyof { actionB: string }, handlerB);

      // Send message for actionA
      simulateMessage({
        __bridge: 'my-extension',
        type: '__to-page__actionA',
        payload: 'payload for A',
      });

      expect(handlerA).toHaveBeenCalledTimes(1);
      expect(handlerA).toHaveBeenCalledWith('payload for A');
      expect(handlerB).not.toHaveBeenCalled();
    });

    it('should support type-safe send and receive', (): void => {
      type Messages = {
        userLoggedIn: { userId: string; username: string };
        fetchData: { query: string };
        dataResponse: { data: number[] };
      };

      const bridge = createBridge<Messages>('my-extension');
      const handler = vi.fn();

      bridge.onMessage('userLoggedIn', handler);

      // Simulate receiving a typed message
      simulateMessage({
        __bridge: 'my-extension',
        type: '__to-page__userLoggedIn',
        payload: { userId: '123', username: 'testuser' },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ userId: '123', username: 'testuser' });
    });

    it('should return unsubscribe function that removes listener', (): void => {
      const bridge = createBridge('my-extension');
      const handler = vi.fn();

      const unsubscribe = bridge.onMessage('test' as keyof { test: string }, handler);
      unsubscribe();

      // Simulate message after unsubscribe - handler should not be called
      simulateMessage({
        __bridge: 'my-extension',
        type: '__to-page__test',
        payload: 'after unsubscribe',
      });

      expect(handler).not.toHaveBeenCalled();
      expect(mockRemoveEventListener).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('should remove all listeners on destroy', (): void => {
      const bridge = createBridge('my-extension');
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bridge.onMessage('msg1' as keyof { msg1: string }, handler1);
      bridge.onMessage('msg2' as keyof { msg2: string }, handler2);

      bridge.destroy();

      // Verify global listener was removed
      expect(mockRemoveEventListener).toHaveBeenCalled();

      // Simulate messages after destroy
      simulateMessage({
        __bridge: 'my-extension',
        type: '__to-page__msg1',
        payload: 'after destroy',
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('injectScript', (): void => {
    it('should create and inject a script element', (): void => {
      const result = injectScript('/injected-script.js');

      expect(mockCreateElement).toHaveBeenCalledTimes(1);
      expect(mockCreateElement).toHaveBeenCalledWith('script');
      expect(mockHeadAppendChild).toHaveBeenCalledTimes(1);
      expect(mockHeadAppendChild).toHaveBeenCalledWith(result);
    });

    it('should set correct attributes on script element', (): void => {
      const result = injectScript('/custom-script.js');

      expect(result.src).toBe('/custom-script.js');
      expect(result.type).toBe('text/javascript');
      expect(result.async).toBe(true);
    });
  });
});
