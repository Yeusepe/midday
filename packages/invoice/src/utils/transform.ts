// Define a generic customer interface to avoid circular dependencies
import type { EditorDoc } from "../types";

interface CustomerData {
  name?: string | null;
  contact?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  email?: string | null;
  billingEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  vatNumber?: string | null;
  financeContact?: string | null;
  financeContactEmail?: string | null;
}

export const transformCustomerToContent = (
  customer?: CustomerData | null,
): EditorDoc | null => {
  if (!customer) return null;

  const content: EditorDoc["content"] = [];

  if (customer.name) {
    content.push({
      type: "paragraph",
      content: [
        {
          text: customer.name,
          type: "text",
        },
      ],
    });
  }

  if (customer.contact) {
    content.push({
      type: "paragraph",
      content: [{ text: customer.contact, type: "text" }],
    });
  }

  if (customer.addressLine1) {
    content.push({
      type: "paragraph",
      content: [{ text: customer.addressLine1, type: "text" }],
    });
  }

  if (customer.addressLine2) {
    content.push({
      type: "paragraph",
      content: [{ text: customer.addressLine2, type: "text" }],
    });
  }

  if (customer.city || customer.state || customer.zip) {
    content.push({
      type: "paragraph",
      content: [
        {
          text: [
            [customer.city, customer.state].filter(Boolean).join(", "),
            customer.zip,
          ]
            .filter(Boolean)
            .join(" "),
          type: "text",
        },
      ],
    });
  }

  if (customer.country) {
    content.push({
      type: "paragraph",
      content: [{ text: customer.country, type: "text" }],
    });
  }

  const email = customer.billingEmail || customer.email;

  if (email) {
    content.push({
      type: "paragraph",
      content: [{ text: email, type: "text" }],
    });
  }

  if (customer.website) {
    content.push({
      type: "paragraph",
      content: [{ text: customer.website, type: "text" }],
    });
  }

  if (customer.phone) {
    content.push({
      type: "paragraph",
      content: [{ text: customer.phone, type: "text" }],
    });
  }

  if (customer.financeContact) {
    content.push({
      type: "paragraph",
      content: [{ text: customer.financeContact, type: "text" }],
    });
  }

  if (customer.financeContactEmail) {
    content.push({
      type: "paragraph",
      content: [{ text: customer.financeContactEmail, type: "text" }],
    });
  }

  if (customer.vatNumber) {
    content.push({
      type: "paragraph",
      content: [{ text: customer.vatNumber, type: "text" }],
    });
  }

  return {
    type: "doc",
    content,
  };
};
