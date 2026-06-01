import { Logo } from "./assets/logo";

// Shared base config - used by both server and client configs
export const baseConfig = {
  name: "Fortnox",
  id: "fortnox",
  category: "accounting",
  active: true,
  beta: true,
  logo: Logo,
  short_description:
    "Export transactions and receipts to Fortnox. Keep your Swedish accounting compliant and up-to-date.",
  description:
    "Connect Creator Payments with Fortnox to streamline your Swedish accounting workflow.\n\n**Manual Transaction Export**\nExport enriched transactions from Creator Payments to Fortnox as vouchers. Review and categorize transactions in Creator Payments first, then push them to Fortnox with a single click. Vouchers are created as finalized entries - the review happens in Creator Payments before export.\n\n**Receipt & Invoice Attachments**\nReceipts and invoices matched to transactions in Creator Payments are automatically attached to the corresponding vouchers in Fortnox, making audit preparation effortless.\n\n**Smart Account Mapping**\nTransaction categories from Creator Payments are mapped to your Fortnox chart of accounts using Swedish BAS standards.",
  settings: [],
  config: {},
};
