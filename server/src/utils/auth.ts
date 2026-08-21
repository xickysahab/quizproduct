import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
};

export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  typ?: string;
  tokenVersion?: number;
}

export const generateToken = (
  userId: string,
  email: string,
  role: string,
  tokenVersion = 0
): string => {
  return jwt.sign({ userId, email, role, tokenVersion, typ: 'host' }, env.jwtSecret, {
    expiresIn: env.hostTokenTtl as jwt.SignOptions['expiresIn'],
  });
};

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as TokenPayload;

    if (decoded.typ === 'participant') return null;
    if (!decoded.userId || !decoded.role) return null;

    return decoded;
  } catch {
    return null;
  }
};
