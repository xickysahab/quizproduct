import jwt from 'jsonwebtoken';
import { env } from '../config/env';

const PARTICIPANT_TOKEN_TYPE = 'participant';

export interface ParticipantTokenPayload {
  participantId: string;
  eventId: string;
  typ: typeof PARTICIPANT_TOKEN_TYPE;
}

/**
 * Issued on join so later answers prove which participant — and which event —
 * they belong to. Without this the participantId in a request body is just a
 * claim the client makes about itself.
 */
export const generateParticipantToken = (participantId: string, eventId: string): string =>
  jwt.sign({ participantId, eventId, typ: PARTICIPANT_TOKEN_TYPE }, env.jwtSecret, {
    expiresIn: env.participantTokenTtl as jwt.SignOptions['expiresIn'],
  });

export const verifyParticipantToken = (token: string): ParticipantTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as ParticipantTokenPayload;

    if (decoded.typ !== PARTICIPANT_TOKEN_TYPE || !decoded.participantId || !decoded.eventId) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
};
