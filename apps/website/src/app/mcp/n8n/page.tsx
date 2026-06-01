import { MCPN8n } from "@/components/mcp-n8n";
import { createPageMetadata } from "@/lib/metadata";

export const metadata = createPageMetadata({
  title: "n8n MCP Integration",
  description:
    "Connect Creator Payments to n8n workflows via MCP. Build automated financial workflows with AI agents and connect to 400+ apps.",
  path: "/mcp/n8n",
  og: {
    title: "n8n + Creator Payments",
    description: "Automated financial workflows with 400+ apps",
  },
  keywords: [
    "n8n MCP",
    "n8n integration",
    "Model Context Protocol",
    "workflow automation",
    "AI agents",
  ],
});

export default function Page() {
  return <MCPN8n />;
}
