import { jwtVerify, SignJWT } from 'jose';
import { env } from '../../config/env.js';

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export interface AccessClaims {
  sub: string;
  sa?: true;
  imp?: string;
}

export const signAccessToken = (claims: AccessClaims, ttl: string = env.JWT_ACCESS_TTL) =>
  new SignJWT({ ...(claims.sa && { sa: true }), ...(claims.imp && { imp: claims.imp }) })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(accessKey);

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, accessKey, { algorithms: ['HS256'] });
  return { sub: payload.sub!, sa: payload.sa as true | undefined, imp: payload.imp as string | undefined };
}
