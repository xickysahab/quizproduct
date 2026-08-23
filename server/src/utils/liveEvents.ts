import { EventEmitter } from 'events';

/**
 * In-process channel from the REST controllers to the socket layer.
 *
 * The host's live counters used to be driven by a `participant:submitAnswer`
 * socket event the client emitted for itself — no payload, no validation, so
 * any participant could loop it and drive the numbers anywhere. Routing the
 * signal through here instead means a counter only ever moves because a
 * response actually passed validation and was accepted.
 */

export interface ResponseRecorded {
  eventId: string;
  questionId: string;
}

export interface ParticipantJoined {
  eventId: string;
}

/** Any change to the Q&A list — new question, vote, or moderation action. */
export interface QaChanged {
  eventId: string;
}

interface LiveEventMap {
  'response:recorded': ResponseRecorded;
  'participant:joined': ParticipantJoined;
  'qa:changed': QaChanged;
}

class LiveEventBus extends EventEmitter {
  publish<K extends keyof LiveEventMap>(event: K, payload: LiveEventMap[K]): void {
    this.emit(event, payload);
  }

  subscribe<K extends keyof LiveEventMap>(
    event: K,
    listener: (payload: LiveEventMap[K]) => void
  ): void {
    this.on(event, listener);
  }
}

export const liveEvents = new LiveEventBus();

// One listener per socket server, but tests and reloads can add more; the
// default of 10 is a warning threshold, not a limit we want to hit.
liveEvents.setMaxListeners(50);
