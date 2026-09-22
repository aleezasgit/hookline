import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { ErrorCode } from "@/lib/types";

const STATUS: Record<ErrorCode, number> = {
  VALIDATION: 400, NOT_FOUND: 404, CONFLICT: 409, INSUFFICIENT_CREDITS: 402,
  TOO_MANY_ACTIVE: 429, DAILY_CAP: 429, AI_FAILED: 502, PROVIDER_FAILED: 502, INTERNAL: 500,
};

export class AppError extends Error {
  constructor(public code: ErrorCode, message: string) { super(message); }
}

type Ctx = { params: Promise<Record<string, string>> };

export function route(handler: (req: Request, ctx: Ctx) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const data = await handler(req, ctx);
      return NextResponse.json(data);
    } catch (e) {
      if (e instanceof AppError)
        return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: STATUS[e.code] });
      if (e instanceof ZodError)
        return NextResponse.json(
          { error: { code: "VALIDATION", message: e.issues[0]?.message ?? "Invalid input" } },
          { status: 400 });
      // H6: a short id ties this log line to what the user sees, so a bug report
      // that just says "it broke (ref abc123)" is still traceable.
      const ref = Math.random().toString(36).slice(2, 8);
      const path = new URL(req.url).pathname;
      console.error(`[${ref}] ${req.method} ${path}:`, e);
      return NextResponse.json(
        { error: { code: "INTERNAL", message: `Something went wrong (ref ${ref}). Try again.` } }, { status: 500 });
    }
  };
}
