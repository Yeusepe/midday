import type { Metadata } from "next";
import { TrackerStopwatch } from "@/components/tracker-stopwatch";

export const metadata: Metadata = {
  title: "Stopwatch | Creator Payments",
};

export default function Page() {
  return <TrackerStopwatch />;
}
