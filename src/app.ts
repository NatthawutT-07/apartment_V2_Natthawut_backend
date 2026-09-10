import cors from "cors";
import { paymentRouter } from './routes/payment.route.js';
import express from "express";
import { handleError, notFound } from "./middleware/error.middleware.js";
import { authRouter } from "./routes/auth.route.js";
import { adminRouter } from "./routes/admin.route.js";
import { superadminRouter } from "./routes/superadmin.route.js";
import { tenantRouter } from "./routes/tenant.route.js";
import { publicRouter } from "./routes/public.route.js";
import * as lineController from "./controllers/line.controller.js";

export const app = express();

app.disable("x-powered-by");
app.use(cors());
app.post("/api/line/webhook", express.raw({ type: "application/json", limit: "1mb" }), lineController.webhook);
app.get("/api/line/callback", lineController.callback);
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);
app.use("/api/superadmin", superadminRouter);
app.use("/api/tenant", tenantRouter);
app.use("/api/public", publicRouter);
app.use('/api/payment-slips', paymentRouter);

app.use(notFound);
app.use(handleError);
