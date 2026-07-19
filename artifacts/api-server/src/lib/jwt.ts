import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET ?? "vidsnap-fallback-secret-change-this";

export interface TokenPayload {
  userId: number;
  email: string;
  role: string;
}

export function signToken(payload: TokenPayload, rememberMe = false): string {
  return jwt.sign(payload, SECRET, {
    expiresIn: rememberMe ? "30d" : "7d",
  });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}
