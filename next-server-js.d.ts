declare module "next/server.js" {
  export type NextRequest = import("next/server").NextRequest;
  export type NextFetchEvent = import("next/server").NextFetchEvent;
  export type NextMiddleware = import("next/server").NextMiddleware;
  export type NextResponse = import("next/server").NextResponse;
  export * from "next/server";
}

/** Next.js generated `.next/types/**` imports this path; local typecheck needs a shim. */
declare module "next/dist/lib/metadata/types/metadata-interface.js" {
  export type ResolvingMetadata = import("next").Metadata | Promise<import("next").Metadata>;
  export type ResolvingViewport =
    | import("next").Viewport
    | Promise<import("next").Viewport>;
}

