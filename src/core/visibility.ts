/**
 * Visibility observer for pausing animations when elements are off-screen.
 * Adapted from aptos-consensus-visualizer pattern.
 *
 * Provides massive performance gains by preventing canvas animations
 * from running when not visible to the user.
 */

export type VisibilityCallback = (isVisible: boolean) => void;

export class VisibilityObserver {
  private observer: IntersectionObserver;
  private callbacks = new Map<Element, VisibilityCallback>();

  constructor(options?: IntersectionObserverInit) {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const callback = this.callbacks.get(entry.target);
          if (callback) {
            callback(entry.isIntersecting);
          }
        }
      },
      {
        threshold: 0.05, // Trigger when 5% visible
        rootMargin: '50px', // Start slightly before visible
        ...options,
      }
    );
  }

  observe(element: Element, callback: VisibilityCallback): () => void {
    this.callbacks.set(element, callback);
    this.observer.observe(element);

    // Check initial visibility
    const rect = element.getBoundingClientRect();
    const initiallyVisible = rect.top < window.innerHeight && rect.bottom > 0;
    callback(initiallyVisible);

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(element);
      this.observer.unobserve(element);
    };
  }

  disconnect() {
    this.observer.disconnect();
    this.callbacks.clear();
  }
}

// Singleton instance for convenience
let defaultObserver: VisibilityObserver | null = null;

export function observeVisibility(
  element: Element,
  callback: VisibilityCallback
): () => void {
  if (!defaultObserver) {
    defaultObserver = new VisibilityObserver();
  }
  return defaultObserver.observe(element, callback);
}

// =============================================================================
// DOCUMENT VISIBILITY (TAB SWITCHING)
// =============================================================================

/**
 * Callback for document visibility changes (tab focus/blur)
 */
export type DocumentVisibilityCallback = (isVisible: boolean) => void;

// Track callbacks and listener state
let documentVisibilityCallbacks = new Set<DocumentVisibilityCallback>();
let isDocumentListenerAttached = false;

function handleDocumentVisibility() {
  const isVisible = document.visibilityState === 'visible';
  documentVisibilityCallbacks.forEach(cb => cb(isVisible));
}

/**
 * Subscribe to document visibility changes (tab focus/blur).
 * Use this to pause data fetching when the browser tab is hidden.
 *
 * @param callback - Called with true when tab is visible, false when hidden
 * @returns Unsubscribe function
 *
 * @example
 * ```typescript
 * const unsubscribe = observeDocumentVisibility((isVisible) => {
 *   megaPolling.setVisible(isVisible);
 * });
 * ```
 */
export function observeDocumentVisibility(
  callback: DocumentVisibilityCallback
): () => void {
  // Attach listener only once
  if (!isDocumentListenerAttached) {
    document.addEventListener('visibilitychange', handleDocumentVisibility);
    isDocumentListenerAttached = true;
  }

  documentVisibilityCallbacks.add(callback);

  // Call with initial state
  callback(document.visibilityState === 'visible');

  // Return unsubscribe function
  return () => {
    documentVisibilityCallbacks.delete(callback);

    // Clean up listener if no more callbacks
    if (documentVisibilityCallbacks.size === 0 && isDocumentListenerAttached) {
      document.removeEventListener('visibilitychange', handleDocumentVisibility);
      isDocumentListenerAttached = false;
    }
  };
}

/**
 * Combine element visibility with document visibility.
 * Returns true only when BOTH the element is in viewport AND the tab is visible.
 *
 * @param element - DOM element to observe
 * @param callback - Called with combined visibility state
 * @returns Unsubscribe function
 */
export function observeCombinedVisibility(
  element: Element,
  callback: VisibilityCallback
): () => void {
  let elementVisible = false;
  let documentVisible = document.visibilityState === 'visible';

  const updateCombined = () => {
    callback(elementVisible && documentVisible);
  };

  const unsubElement = observeVisibility(element, (visible) => {
    elementVisible = visible;
    updateCombined();
  });

  const unsubDocument = observeDocumentVisibility((visible) => {
    documentVisible = visible;
    updateCombined();
  });

  // Return combined unsubscribe
  return () => {
    unsubElement();
    unsubDocument();
  };
}
