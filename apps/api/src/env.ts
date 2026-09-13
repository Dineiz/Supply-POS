const isProduction = process.env.NODE_ENV === "production";

export const PORT = Number(process.env.PORT ?? 4000);

if (!process.env.JWT_SECRET && isProduction) {
  throw new Error(
    "[dineiz-supply-api] JWT_SECRET must be set in production — refusing to start with the " +
      "public development default, which would let anyone forge a valid login token."
  );
}

export const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-insecure-secret-change-me";

if (!process.env.JWT_SECRET) {
  console.warn(
    "[dineiz-supply-api] JWT_SECRET is not set — using an insecure development default. " +
      "Set JWT_SECRET before deploying anywhere real."
  );
}

if (!process.env.DATABASE_URL && isProduction) {
  throw new Error("[dineiz-supply-api] DATABASE_URL must be set in production.");
}

// Accepts CORS_ORIGINS or CORS_ORIGIN (comma-separated in production)
const rawCors = process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? "http://localhost:3000";
export const CORS_ORIGIN = rawCors
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
