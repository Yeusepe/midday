import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { InvoiceWorkLog } from "../templates/html/components/work-log";
import type { LineItem } from "../types";
import {
  formatWorkLogDate,
  formatWorkLogTime,
  getWorkLogTicketIdentifiers,
  replaceWorkLogTicketIdentifier,
} from "./work-log";

const item: LineItem = {
  name: "Development",
  quantity: 3,
  price: 100,
  tickets: [
    { identifier: "WEB-10", title: "Layout" },
    { identifier: "ENG-99", title: "Moved issue" },
  ],
  details: [
    {
      date: "2026-11-02",
      title: "First session",
      hours: 1,
      duration: 3600,
      ticketIdentifiers: ["WEB-10", "ENG-99"],
    },
    {
      date: "2026-11-02",
      title: "Second session",
      hours: 2,
      duration: 7200,
      ticketIdentifiers: ["ENG-99"],
    },
  ],
};

test("work log keeps many-to-many ticket associations and prints each title once", () => {
  const html = renderToStaticMarkup(
    <InvoiceWorkLog item={item} locale="en-US" />,
  );
  expect(html).toContain("1:00:00");
  expect(html).toContain("2:00:00");
  expect(html.split("Moved issue")).toHaveLength(2);
  expect(getWorkLogTicketIdentifiers(item, item.details![0]!)).toEqual([
    "WEB-10",
    "ENG-99",
  ]);
  expect(getWorkLogTicketIdentifiers(item, item.details![1]!)).toEqual([
    "ENG-99",
  ]);
  expect(html).not.toContain("$300");
});

test("legacy flat ticket snapshots remain visible without fabricated associations", () => {
  const legacy = { ...item, details: [{ title: "Legacy session", hours: 3 }] };
  expect(getWorkLogTicketIdentifiers(legacy, legacy.details[0]!)).toEqual([]);
  const html = renderToStaticMarkup(
    <InvoiceWorkLog item={legacy} locale="en-US" />,
  );
  expect(html).toContain("Legacy session");
  expect(html).toContain("3h");
  expect(html).toContain("Moved issue");
  expect(html).not.toContain("Tickets for this entry");
});

test("renaming or removing a snapshot updates references without changing time or billing", () => {
  const renamed = replaceWorkLogTicketIdentifier(
    item.details,
    "ENG-99",
    "ENG-100",
  );
  expect(renamed.map((d) => d.ticketIdentifiers)).toEqual([
    ["WEB-10", "ENG-100"],
    ["ENG-100"],
  ]);
  const removed = replaceWorkLogTicketIdentifier(renamed, "ENG-100", null);
  expect(removed.map((d) => d.ticketIdentifiers)).toEqual([["WEB-10"], []]);
  for (const details of [renamed, removed]) {
    expect(details.map((d) => [d.hours, d.duration, d.title])).toEqual(
      item.details!.map((d) => [d.hours, d.duration, d.title]),
    );
  }
  expect(item.details![0]!.ticketIdentifiers).toEqual(["WEB-10", "ENG-99"]);
});

test("removed and unknown tickets cannot leak through dangling session references", () => {
  const withoutTickets = { ...item, tickets: [] };
  expect(
    getWorkLogTicketIdentifiers(withoutTickets, item.details![0]!),
  ).toEqual([]);
  expect(
    renderToStaticMarkup(
      <InvoiceWorkLog item={withoutTickets} locale="en-US" />,
    ),
  ).not.toMatch(/WEB-10|ENG-99|Ticket reference/);
});

test("exact time and edited hours display consistently without rounding away seconds", () => {
  expect(formatWorkLogTime({ duration: 12599, hours: 3.5 })).toBe("3:29:59");
  expect(formatWorkLogTime({ duration: 12599, hours: 4 })).toBe("4h");
  expect(formatWorkLogTime({ duration: 0, hours: 0 })).toBe("0:00:00");
  expect(formatWorkLogTime({})).toBe("");
});

test("date-only values keep their day and malformed legacy dates do not crash rendering", () => {
  expect(formatWorkLogDate("2026-11-02", "en-US")).toBe("Nov 2, 2026");
  expect(formatWorkLogDate("legacy date", "en-US")).toBe("legacy date");
});

test("plain text descriptions and ticket titles are escaped", () => {
  const unsafe = {
    ...item,
    details: [
      {
        title: '<img src=x onerror="alert(1)">',
        ticketIdentifiers: ["WEB-10"],
      },
    ],
    tickets: [{ identifier: "WEB-10", title: "<script>alert(1)</script>" }],
  };
  const html = renderToStaticMarkup(
    <InvoiceWorkLog item={unsafe} locale="en-US" />,
  );
  expect(html).not.toContain("<script>");
  expect(html).not.toContain("<img");
  expect(html).toContain("&lt;script&gt;");
});
