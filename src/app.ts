import cors from "cors";
import express from "express";
import { handleError, notFound } from "./middleware/error.middleware.js";
import { authRouter } from "./routes/auth.route.js";
import { superadminRouter } from "./routes/superadmin.route.js";

export const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});
app.use("/api/auth", authRouter);
app.use("/api/superadmin", superadminRouter);

app.use(notFound);
app.use(handleError);
