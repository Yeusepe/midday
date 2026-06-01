"use client";

import { isDesktopApp } from "@midday/desktop-client/platform";
import { createClient } from "@midday/supabase/client";
import type { Provider } from "@supabase/supabase-js";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { getUrl } from "@/utils/environment";

export type OAuthProvider = "discord";

type ProviderConfig = {
  name: string;
  icon: "Discord";
  scopes?: string;
  queryParams?: Record<string, string>;
  variant: "primary" | "secondary";
  supportsReturnTo: boolean;
};

const OAUTH_PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  discord: {
    name: "Discord",
    icon: "Discord",
    variant: "primary",
    supportsReturnTo: true,
  },
};

export function useOAuthSignIn(provider: OAuthProvider) {
  const [isLoading, setLoading] = useState(false);
  const supabase = createClient();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to");
  const config = OAUTH_PROVIDERS[provider];

  const handleSignIn = async () => {
    setLoading(true);

    const redirectTo = new URL("/api/auth/callback", getUrl());
    redirectTo.searchParams.append("provider", provider);

    const isDesktop = isDesktopApp();

    if (isDesktop) {
      redirectTo.searchParams.append("client", "desktop");
    } else if (config.supportsReturnTo && returnTo) {
      redirectTo.searchParams.append("return_to", returnTo);
    }

    const queryParams = isDesktop
      ? { ...config.queryParams, client: "desktop" }
      : config.queryParams;

    await supabase.auth.signInWithOAuth({
      provider: provider as Provider,
      options: {
        redirectTo: redirectTo.toString(),
        scopes: config.scopes,
        queryParams,
      },
    });

    setTimeout(() => {
      setLoading(false);
    }, 2000);
  };

  return { handleSignIn, isLoading, config };
}
