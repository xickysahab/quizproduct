import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/auth';
import { getUserAuthState } from '../utils/userStatus';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

export const authenticateHost = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Authentication required. Missing token.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    res.status(401).json({ message: 'Authentication required. Missing token.' });
    return;
  }

  const decoded = verifyToken(token);

  if (!decoded || !decoded.userId || !decoded.role) {
    res.status(401).json({ message: 'Invalid or expired token. Please log in again.' });
    return;
  }

  const state = await getUserAuthState(decoded.userId);
  if (!state?.isActive) {
    res.status(403).json({ message: 'This account has been deactivated.' });
    return;
  }

  // Tokens minted before password-reset/tokenVersion still work (missing field
  // is treated as 0). After a password change the version bumps and old JWTs die.
  if ((decoded.tokenVersion ?? 0) !== state.tokenVersion) {
    res.status(401).json({ message: 'Session expired. Please log in again.' });
    return;
  }

  req.user = { userId: decoded.userId, email: decoded.email, role: decoded.role };
  next();
};

export const authorizeRoles = (...allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !req.user.role) {
      res.status(403).json({ message: 'Access denied. No role provided.' });
      return;
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
      return;
    }
    
    next();
  };
};
