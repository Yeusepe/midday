"use client";

import type { AppRouter } from "@midday/api/trpc/routers/_app";
import type { QueryClient } from "@tanstack/react-query";
import { isServer, QueryClientProvider } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchStreamLink,
  loggerLink,
  splitLink,
} from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState } from "react";
import superjson from "superjson";
import { Cookies } from "@/utils/constants";
import { getAccessToken } from "@/utils/session";
import { makeQueryClient } from "./query-client";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
  return null;
}

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

let browserQueryClient: QueryClient;

function getQueryClient() {
  if (isServer) {
    return makeQueryClient();
  }

  if (!browserQueryClient) browserQueryClient = makeQueryClient();

  return browserQueryClient;
}

// Keep private ticket searches out of request URLs and ordinary GET batches.
function createHttpLink(methodOverride?: "POST") {
  return httpBatchStreamLink<AppRouter>({
    methodOverride,
    url: `${process.env.NEXT_PUBLIC_API_URL}/trpc`,
    transformer: superjson,
    async headers() {
      const accessToken = await getAccessToken();

      const headers: Record<string, string> = {};

      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }

      const forcePrimary = getCookie(Cookies.ForcePrimary);
      if (forcePrimary === "true") {
        headers["x-force-primary"] = "true";
      }

      return headers;
    },
  });
}

export function TRPCReactProvider(
  props: Readonly<{
    children: React.ReactNode;
  }>,
) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        splitLink({
          condition: (op) => op.path.startsWith("linear."),
          true: createHttpLink("POST"),
          false: createHttpLink(),
        }),
        loggerLink({
          enabled: (opts) => {
            // tRPC includes path in both directions at runtime; its down type omits it.
            const path = (opts as { path?: string }).path;
            return (
              typeof path === "string" &&
              !path.startsWith("linear.") &&
              (process.env.NODE_ENV === "development" ||
                (opts.direction === "down" && opts.result instanceof Error))
            );
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
