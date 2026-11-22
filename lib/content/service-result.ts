import { NextResponse } from "next/server";

/**
 * What a shared service returns: an HTTP-style status and the exact body the
 * app's route has always sent (2026-11-22, the agent layer). Routes turn it
 * into a response unchanged; agent tools read it directly. One result shape,
 * so the app and AI clients get the same answers and the same refusals.
 */
export interface ServiceResult<T = unknown> {
  status: number;
  body: T;
}

export function toResponse(r: ServiceResult): NextResponse {
  return NextResponse.json(r.body, { status: r.status });
}

/** A route-style refusal (e.g. the free-trial gate) as a ServiceResult. */
export async function fromResponse(res: Response): Promise<ServiceResult> {
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
