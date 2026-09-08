import jwt from "jsonwebtoken";
import { env } from "../env.js";

export function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret);
  } catch {
    return null;
  }
}
