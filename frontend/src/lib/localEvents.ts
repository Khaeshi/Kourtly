type EventName =
  | 'players:updated'
  | 'items:updated'
  | 'billing:tab_updated'
  | 'billing:tab_paid'
  | 'data:sync';

type Payload = { name: EventName; at: number };

const CHANNEL = 'playkou-events';

function hasBroadcastChannel(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).BroadcastChannel !== 'undefined';
}

export function emitLocalEvent(name: EventName) {
  const payload: Payload = { name, at: Date.now() };

  if (hasBroadcastChannel()) {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage(payload);
    bc.close();
    return;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CHANNEL, { detail: payload }));
  }
}

export function subscribeLocalEvent(name: EventName, cb: () => void) {
  if (hasBroadcastChannel()) {
    const bc = new BroadcastChannel(CHANNEL);
    const handler = (ev: MessageEvent) => {
      const msg = ev.data as Payload | undefined;
      if (msg?.name === name) cb();
    };
    bc.addEventListener('message', handler);
    return () => {
      bc.removeEventListener('message', handler);
      bc.close();
    };
  }

  const handler = (ev: Event) => {
    const ce = ev as CustomEvent;
    const msg = ce.detail as Payload | undefined;
    if (msg?.name === name) cb();
  };
  window.addEventListener(CHANNEL, handler as EventListener);
  return () => window.removeEventListener(CHANNEL, handler as EventListener);
}

