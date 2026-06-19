import jwt from 'jsonwebtoken';
import { User } from '../models/user.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL = '7d';

export function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, SECRET, { expiresIn: TOKEN_TTL });
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing token' });
  try {
    const payload = jwt.verify(token, SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'UNAUTHORIZED', message: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid or expired token' });
  }
}

export function requireFirmAdmin(req, res, next) {
  if (req.user?.role !== 'firm_admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Firm admin role required' });
  }
  next();
}
