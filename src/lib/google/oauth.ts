import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { HttpError } from "../supabase/server";

export const GOOGLE_SCOPES = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.readonly", "openid", "email"];

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function secret() {
  const s = process.env.GOOGLE_STATE_SECRET ?? process.env.CRON_SECRET;
  if (!s) throw new HttpError(503, "GOOGLE_STATE_SECRET is not configured");
  return s;
}

export function appUrl(req: Request) {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(req.url).origin;
}

export function redirectUri(req: Request) {
  return `${appUrl(req)}/api/google/callback`;
}

/** Estat signat (HMAC) que vincula la resposta d'OAuth a l'usuari, amb caducitat */
export function signState(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + 10 * 60000 })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyState(state: string): string {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) throw new HttpError(400, "Invalid state");
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(400, "Invalid state");
  const { u, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (Date.now() > e) throw new HttpError(400, "State expired");
  return u as string;
}

export function authUrl(req: Request, userId: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state: signState(userId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  error?: string;
}

export async function exchangeCode(req: Request, code: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) throw new HttpError(400, json.error ?? "Token exchange failed");
  return json;
}

export async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) throw new HttpError(res.status === 400 ? 401 : 502, json.error ?? "Token refresh failed");
  return json;
}

export async function revokeToken(token: string) {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => {});
}

export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    return JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString()).email ?? null;
  } catch {
    return null;
  }
}
