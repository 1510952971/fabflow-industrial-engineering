export class ApiError extends Error {
  constructor(public status: number, message: string, public code = "API_ERROR") {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(error);
  return Response.json({ error: "服务端处理失败，请稍后重试或联系管理员", code: "INTERNAL_ERROR" }, { status: 500 });
}

export function requestId(request: Request) {
  return request.headers.get("cf-ray") ?? request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function clientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
