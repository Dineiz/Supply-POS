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
const rawCors = process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? "http://localhost:3000,http://localhost:3001,http://localhost:3005";
export const CORS_ORIGIN = isProduction
  ? rawCors
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
      // In development, allow requests with no origin or from any localhost port
      if (!origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        cb(null, true);
        return;
      }
      const allowed = rawCors.split(",").map((o) => o.trim());
      cb(null, allowed.includes(origin));
    };

