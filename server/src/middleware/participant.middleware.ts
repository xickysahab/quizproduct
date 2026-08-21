import { Request, Response, NextFunction } from 'express';
import { verifyParticipantToken } from '../utils/participantToken';

export interface ParticipantRequest extends Request {
  participant?: {
    participantId: string;
    eventId: string;
  };
}

const PARTICIPANT_HEADER = 'x-participant-token';

/**
 * Participants are anonymous but not unidentified: the token issued at join
 * time is the only accepted source of participantId and eventId. A separate
 * header keeps this independent of the host `Authorization` header, so a host
 * browsing as a participant does not collide with their own session.
 */
export const authenticateParticipant = (
  req: ParticipantRequest,
  res: Response,
  next: NextFunction
): void => {
  const headerValue = req.headers[PARTICIPANT_HEADER];
  const token = Array.isArray(headerValue) ? headerValue[0] : headerValue;

  if (!token) {
    res.status(401).json({ message: 'Session expired. Please rejoin the room.' });
    return;
  }

  const decoded = verifyParticipantToken(token);

  if (!decoded) {
    res.status(401).json({ message: 'Session expired. Please rejoin the room.' });
    return;
  }

  req.participant = { participantId: decoded.participantId, eventId: decoded.eventId };
  next();
};
