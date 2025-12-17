import { Request, Response, NextFunction } from 'express';
import { ZodError } from "zod";

export function errorHandler(err: any, _req: any, res: any, _next: any) {
  // ✅ don’t do console.error(err) — it can crash on circular structures
  console.error("ERROR:", err?.message ?? String(err));

  if (err instanceof ZodError) {
    console.error("ZOD ISSUES:", err.issues); // ✅ this is safe
    return res.status(400).json({ message: "Validation error", issues: err.issues });
  }

  return res.status(err?.status ?? 500).json({ message: err?.message ?? "Internal Server Error" });
}
