import { MCPWindsurf } from "@/components/mcp-windsurf";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "Windsurf MCP Integration",
  description:
    "Connect Windsurf to your Creator Payments data via Model Context Protocol. Query transactions, invoices, and reports from your AI IDE.",
  path: "/mcp/windsurf",
  og: {
    title: "Windsurf + Creator Payments",
    description: "Business data from your AI IDE",
  },
  keywords: [
    "Windsurf MCP",
    "Windsurf integration",
    "Model Context Protocol",
    "AI IDE financial data",
  ],
});

export default function Page() {
  return <MCPWindsurf />;
}
