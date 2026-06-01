import { LogEvents } from "@midday/events/events";
import { setupAnalytics } from "@midday/events/server";
import { getSession } from "@midday/supabase/cached-queries";
import { createClient } from "@midday/supabase/server";
import { sanitizeRedirectPath } from "@midday/utils/sanitize-redirect";
import type { Session } from "@supabase/supabase-js";
import { addSeconds, addYears } from "date-fns";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getTRPCClient } from "@/trpc/server";
import { Cookies } from "@/utils/constants";
import { getUrl } from "@/utils/environment";

function getStringMetadata(
  metadata: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = metadata[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }
}

async function ensureUserProfile(session: Session) {
  const metadata = session.user.user_metadata ?? {};
  const fullName = getStringMetadata(metadata, [
    "full_name",
    "global_name",
    "name",
  ]);
  const avatarUrl = getStringMetadata(metadata, ["avatar_url", "picture"]);
  const email =
    session.user.email ?? getStringMetadata(metadata, ["email"]) ?? null;

  const supabaseAdmin = await createClient({ admin: true });
  const { error } = await supabaseAdmin.from("users").upsert(
    {
      id: session.user.id,
      email,
      ...(fullName ? { full_name: fullName } : {}),
      ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
    },
    { onConflict: "id" },
  );

  if (error) {
    throw error;
  }
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const requestUrl = new URL(req.url);
  const origin = getUrl();
  const code = requestUrl.searchParams.get("code");
  const client = requestUrl.searchParams.get("client");
  const returnTo = requestUrl.searchParams.get("return_to");
  const provider = requestUrl.searchParams.get("provider");

  if (provider && provider !== "discord") {
    return NextResponse.redirect(`${origin}/login`);
  }

  if (client === "desktop") {
    return NextResponse.redirect(`${origin}/verify?code=${code}`);
  }

  if (provider) {
    cookieStore.set(Cookies.PreferredSignInProvider, provider, {
      expires: addYears(new Date(), 1),
    });
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(`${origin}/login`);
    }

    const {
      data: { session },
    } = await getSession();

    if (session) {
      await ensureUserProfile(session);

      // Set cookie to force primary database reads for subsequent client-side
      // requests after redirect. This prevents replication lag issues when the
      // user record hasn't replicated to read replicas yet.
      cookieStore.set(Cookies.ForcePrimary, "true", {
        expires: addSeconds(new Date(), 30),
        httpOnly: false, // Needs to be readable by client-side tRPC
        sameSite: "lax",
      });

      // If user is redirected from an invite, redirect to teams page to accept/decline the invite
      if (returnTo?.startsWith("teams/invite/")) {
        const analytics = await setupAnalytics();
        analytics.track({
          event: LogEvents.SignIn.name,
          channel: LogEvents.SignIn.channel,
          provider: provider ?? "unknown",
          destination: "teams",
        });

        return NextResponse.redirect(`${origin}/teams`);
      }

      // Explicitly force primary reads for this query -- the user may have
      // just been created and not yet replicated to read replicas.
      const trpcClient = await getTRPCClient({ forcePrimary: true });
      const user = await trpcClient.user.me.query();

      const isOnboarding = !user?.fullName || !user.teamId;
      const analytics = await setupAnalytics();

      analytics.track({
        event: LogEvents.SignIn.name,
        channel: LogEvents.SignIn.channel,
        provider: provider ?? "unknown",
        destination: isOnboarding ? "onboarding" : "dashboard",
      });

      if (isOnboarding) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    }
  }

  if (returnTo) {
    // The middleware strips the leading "/" (e.g. "settings/accounts"),
    // but sanitizeRedirectPath requires a root-relative path starting with "/".
    const normalized = returnTo.startsWith("/") ? returnTo : `/${returnTo}`;
    const safePath = sanitizeRedirectPath(normalized);
    return NextResponse.redirect(`${origin}${safePath}`);
  }

  return NextResponse.redirect(origin);
}
