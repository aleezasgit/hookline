import { NextResponse, type NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  if (req.cookies.get("ws_id")) return NextResponse.next();
  const id = crypto.randomUUID();
  req.cookies.set("ws_id", id); // so this same request already sees it
  const res = NextResponse.next({ request: { headers: req.headers } });
  res.cookies.set("ws_id", id, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|mock/|previews/|llms.txt).*)"],
};
