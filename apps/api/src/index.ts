import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import itemRoutes from "./routes/items.js";
import customerRoutes from "./routes/customers.js";
import issueRoutes from "./routes/issues.js";
import unitRoutes from "./routes/units.js";
import supplierRoutes from "./routes/suppliers.js";
import goodsReceiptRoutes from "./routes/goods-receipts.js";
import returnRoutes from "./routes/returns.js";
import paymentRoutes from "./routes/payments.js";
import wastageRoutes from "./routes/wastage.js";
import stockCountRoutes from "./routes/stock-counts.js";
import reportRoutes from "./routes/reports.js";
import warehouseRoutes from "./routes/warehouse.js";
import { PORT, CORS_ORIGIN } from "./env.js";

const app = Fastify({ logger: true, trustProxy: true });

app.get("/health", async () => ({ status: "ok", service: "dineiz-supply-api" }));

await app.register(cors, { origin: CORS_ORIGIN });
await app.register(rateLimit, { max: 100, timeWindow: "1 minute" });
await app.register(authPlugin);

await app.register(authRoutes);
await app.register(itemRoutes);
await app.register(customerRoutes);
await app.register(issueRoutes);
await app.register(unitRoutes);
await app.register(supplierRoutes);
await app.register(goodsReceiptRoutes);
await app.register(returnRoutes);
await app.register(paymentRoutes);
await app.register(wastageRoutes);
await app.register(stockCountRoutes);
await app.register(reportRoutes);
await app.register(warehouseRoutes);

app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
