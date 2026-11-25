import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.119.2";

export class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type OwnerHandler = (
  client: SupabaseClient,
  body: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export function withOwner(handler: OwnerHandler) {
  const origins = new Set(
    (Deno.env.get("SITE_ORIGINS") ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
  );

  return async (request: Request): Promise<Response> => {
    const origin = request.headers.get("Origin");
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Vary": "Origin",
    });
    const json = (value: Record<string, unknown>, status = 200) =>
      Response.json(value, { status, headers });

    if (origin) {
      if (!origins.has(origin)) {
        return json({ error: "origin_denied", message: "Địa chỉ website chưa được cấu hình." }, 403);
      }
      headers.set("Access-Control-Allow-Origin", origin);
      headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }
    if (request.method !== "POST") {
      headers.set("Allow", "POST, OPTIONS");
      return json({ error: "method_not_allowed", message: "Yêu cầu cần dùng phương thức POST." }, 405);
    }

    try {
      const authorization = request.headers.get("Authorization");
      if (!authorization || !/^Bearer [^\s]+$/i.test(authorization)) {
        throw new RequestError(401, "login_required", "Vui lòng đăng nhập để tiếp tục.");
      }

      const client = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        {
          global: { headers: { Authorization: authorization } },
          auth: { persistSession: false, autoRefreshToken: false },
        },
      );
      const { data: { user }, error: authError } = await client.auth.getUser(authorization.slice(7));
      if (authError || !user) {
        throw new RequestError(401, "login_required", "Phiên đăng nhập đã hết hạn.");
      }

      const { data: owner, error: ownerError } = await client.rpc("is_study_owner");
      if (ownerError) throw ownerError;
      if (owner !== true) {
        throw new RequestError(403, "owner_required", "Tài khoản này chưa được cấp quyền học.");
      }

      const rawBody = await request.text();
      if (rawBody.length > 8192) {
        throw new RequestError(413, "body_too_large", "Yêu cầu vượt giới hạn kích thước.");
      }
      const body: unknown = parseJson(rawBody);
      if (!isObject(body)) {
        throw new RequestError(400, "invalid_request", "Yêu cầu không hợp lệ.");
      }
      return json(await handler(client, body));
    } catch (error) {
      if (error instanceof RequestError) {
        return json({ error: error.code, message: error.message }, error.status);
      }
      return json({ error: "service_error", message: "Dịch vụ đang gặp lỗi. Vui lòng thử lại." }, 500);
    }
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
