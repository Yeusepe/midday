import { StartPage } from "@/components/startpage";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Creator Payments — The business stack for modern founders",
  description:
    "Invoicing, automatic reconciliation, time tracking, documents, and financial exports in one place. The business stack that replaces the tools you've outgrown.",
  path: "/",
  og: {
    title: "Creator Payments",
    description: "The business stack for modern founders",
  },
});

export default function Page() {
  return <StartPage />;
}
