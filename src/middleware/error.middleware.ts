import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/app-error.js";
import { Prisma } from '../generated/prisma/client.js';

export const notFound: RequestHandler = (_request, response) => {
  response.status(404).json({ message: "Route not found" });
};

export const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
    response.status(409).json({ message: 'Record was changed or is no longer available. Please refresh.' });
    return;
  }
  if (error instanceof ZodError) {
    response.status(400).json({
      message: "Invalid request",
      errors: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({ message: error.message });
    return;
  }

  console.error(error);
  response.status(500).json({ message: "Internal server error" });
};
