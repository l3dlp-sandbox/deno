// Copyright 2018-2025 the Deno authors. MIT license.

import { primordials } from "ext:core/mod.js";
import type { Span } from "ext:deno_telemetry/telemetry.ts";

const { String, StringPrototypeSlice } = primordials;

export function updateSpanFromRequest(span: Span, request: Request) {
  span.updateName(request.method);

  span.setAttribute("http.request.method", request.method);
  const url = new URL(request.url);
  span.setAttribute("url.full", request.url);
  span.setAttribute(
    "url.scheme",
    StringPrototypeSlice(url.protocol, 0, -1),
  );
  span.setAttribute("url.path", url.pathname);
  span.setAttribute("url.query", StringPrototypeSlice(url.search, 1));
}

export function updateSpanFromResponse(span: Span, response: Response) {
  span.setAttribute(
    "http.response.status_code",
    String(response.status),
  );
  if (response.status >= 400) {
    span.setAttribute("error.type", String(response.status));
    span.setStatus({ code: 2, message: response.statusText });
  }
}

// deno-lint-ignore no-explicit-any
export function updateSpanFromError(span: Span, error: any) {
  span.setAttribute("error.type", error.name ?? "Error");
  span.setStatus({ code: 2, message: error.message ?? String(error) });
}
