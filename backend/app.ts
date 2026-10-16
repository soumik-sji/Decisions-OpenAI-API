import type { BunRequest } from "bun";
import { z } from "zod";
import { getEmail, insertEmail, listEmails, listRuns } from "./db/queries";
import { benchmarkRunSchema, compareRequestSchema, createEmailSchema, useCaseSchema } from "./schemas";
import { results, runBenchmark } from "./services/benchmarks";
import { AppError, compare, type Deps } from "./services/compare";

type Handler<P extends string> = (req: BunRequest<P>) => Response | Promise<Response>;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function errorResponse(status: number, code: string, message: string, details?: unknown): Response {
  return json({ error: { code, message, ...(details === undefined ? {} : { details }) } }, status);
}

async function readBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new AppError(400, "invalid_json", "Request body must be valid JSON");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw Object.assign(new AppError(400, "validation_error", "Request body is invalid"), {
      details: z.flattenError(parsed.error as z.ZodError<Record<string, unknown>>),
    });
  }
  return parsed.data;
}

export function createRoutes(deps: Deps) {
  const origin = deps.config.frontendOrigin;
  const corsHeaders = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };

  function withCors(res: Response): Response {
    for (const [k, v] of Object.entries(corsHeaders)) res.headers.set(k, v);
    return res;
  }

  function wrap<P extends string>(handler: Handler<P>): Handler<P> {
    return async (req) => {
      try {
        return withCors(await handler(req));
      } catch (err) {
        if (err instanceof AppError) {
          return withCors(errorResponse(err.status, err.code, err.message, (err as { details?: unknown }).details));
        }
        console.error("Unhandled error:", err instanceof Error ? err.message : err);
        return withCors(errorResponse(500, "internal_error", "Internal server error"));
      }
    };
  }

  const preflight = () => withCors(new Response(null, { status: 204 }));

  return {
    "/api/health": {
      GET: wrap(() =>
        json({
          status: "ok",
          providers: {
            // Reports whether configuration is present, never the values themselves.
            jev: { configured: Boolean(deps.config.jev.apiKey && deps.config.jev.model), model: deps.config.jev.model },
            openai: {
              configured: Boolean(deps.config.openai.apiKey && deps.config.openai.baselineModel),
              baselineModel: deps.config.openai.baselineModel,
              tierModels: deps.config.openai.tierModels,
            },
          },
        }),
      ),
      OPTIONS: preflight,
    },

    "/api/emails": {
      GET: wrap(() => json({ emails: listEmails(deps.db) })),
      POST: wrap(async (req) => {
        const input = await readBody(req, createEmailSchema);
        return json({ email: insertEmail(deps.db, input) }, 201);
      }),
      OPTIONS: preflight,
    },

    "/api/emails/:id": {
      GET: wrap<"/api/emails/:id">((req) => {
        const email = getEmail(deps.db, req.params.id);
        if (!email) throw new AppError(404, "not_found", `Email ${req.params.id} not found`);
        return json({ email });
      }),
      OPTIONS: preflight,
    },

    "/api/emails/:id/compare": {
      POST: wrap<"/api/emails/:id/compare">(async (req) => {
        const body = await readBody(req, compareRequestSchema);
        const result = await compare(deps, req.params.id, body.useCase, { candidateReply: body.candidateReply });
        return json(result);
      }),
      OPTIONS: preflight,
    },

    "/api/emails/:id/runs": {
      GET: wrap<"/api/emails/:id/runs">((req) => {
        if (!getEmail(deps.db, req.params.id)) {
          throw new AppError(404, "not_found", `Email ${req.params.id} not found`);
        }
        return json({ runs: listRuns(deps.db, req.params.id) });
      }),
      OPTIONS: preflight,
    },

    "/api/benchmarks/run": {
      POST: wrap(async (req) => json(await runBenchmark(deps, await readBody(req, benchmarkRunSchema)))),
      OPTIONS: preflight,
    },

    "/api/benchmarks/results": {
      GET: wrap((req) => {
        const params = new URL(req.url).searchParams;
        const useCaseParam = params.get("useCase");
        const useCase = useCaseParam === null ? undefined : useCaseSchema.safeParse(useCaseParam);
        if (useCase && !useCase.success) throw new AppError(400, "validation_error", "Unknown useCase");
        return json({
          results: results(deps, { useCase: useCase?.data, benchmarkId: params.get("benchmarkId") ?? undefined }),
        });
      }),
      OPTIONS: preflight,
    },

    "/api/*": wrap(() => errorResponse(404, "not_found", "Route not found")),
  };
}
