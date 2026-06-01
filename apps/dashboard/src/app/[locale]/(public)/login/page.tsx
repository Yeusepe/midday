import { Icons } from "@midday/ui/icons";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { LoginVideoBackground } from "@/components/login-video-background";
import { OAuthSignIn } from "@/components/oauth-sign-in";
import { SunsetBanner } from "@/components/sunset-banner";
import { Cookies } from "@/utils/constants";

export const metadata: Metadata = {
  title: "Login | Creator Payments",
};

export default async function Page() {
  const cookieStore = await cookies();
  const preferred = cookieStore.get(Cookies.PreferredSignInProvider);

  return (
    <div className="min-h-screen bg-background flex relative">
      {/* Sunset banner + logo - Fixed position matching website header exactly */}
      <div className="fixed top-0 left-0 right-0 z-50 w-full">
        <SunsetBanner />
        <nav className="w-full pointer-events-none">
          <div className="relative py-3 xl:py-4 px-4 sm:px-4 md:px-4 lg:px-4 xl:px-6 2xl:px-8 flex items-center">
            <Link
              href="https://midday.ai"
              className="flex items-center gap-2 hover:opacity-80 active:opacity-80 transition-opacity duration-200 pointer-events-auto"
            >
              <div className="w-6 h-6">
                <Icons.LogoSmall className="w-full h-full text-foreground lg:text-white" />
              </div>
            </Link>
          </div>
        </nav>
      </div>

      {/* Left Side - Video Background */}
      <LoginVideoBackground />

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center p-8 lg:p-12 pb-2">
        <div className="w-full max-w-md flex flex-col h-full">
          <div className="space-y-8 flex-1 flex flex-col justify-center">
            {/* Header */}
            <div className="text-center space-y-2">
              <h1 className="text-lg lg:text-xl mb-4 font-serif">
                Welcome to Creator Payments
              </h1>
              <p className="font-sans text-sm text-[#878787]">
                Sign in or create an account
              </p>
            </div>

            {/* Sign In Options */}
            <div className="space-y-3 flex items-center justify-center w-full">
              <OAuthSignIn
                provider="discord"
                showLastUsed={preferred?.value === "discord"}
              />
            </div>
          </div>

          {/* Terms and Privacy Policy - Bottom aligned */}
          <div className="text-center mt-auto">
            <p className="font-sans text-xs text-[#878787]">
              By signing in you agree to our{" "}
              <Link
                href="https://midday.ai/terms"
                className="text-[#878787] hover:text-foreground transition-colors underline"
              >
                Terms of service
              </Link>{" "}
              &{" "}
              <Link
                href="https://midday.ai/policy"
                className="text-[#878787] hover:text-foreground transition-colors underline"
              >
                Privacy policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
