export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "API_ERROR") {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  console.error(error);
  return Response.json({ error: message, code: "INTERNAL_ERROR" }, { status: 500 });
}

export function requestId(request: Request) {
  return request.headers.get("cf-ray") ?? request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
