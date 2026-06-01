import type { Metadata } from "next";
import { ErrorBoundary } from "next/dist/client/components/error-boundary";
import { Suspense } from "react";
import { ErrorFallback } from "@/components/error-fallback";
import { ProductsSkeleton } from "@/components/tables/products/skeleton";
import { DataTable } from "@/components/tables/products/table";

export const metadata: Metadata = {
  title: "Products | Creator Payments",
};

export default function Page() {
  return (
    <div className="max-w-screen-lg">
      <ErrorBoundary errorComponent={ErrorFallback}>
        <Suspense fallback={<ProductsSkeleton />}>
          <DataTable />
        </Suspense>
      </ErrorBoundary>
    </div>
  );
}
