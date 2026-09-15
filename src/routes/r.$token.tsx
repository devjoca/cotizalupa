import { createFileRoute } from "@tanstack/react-router";

// Public report page. Lookup by sha256(token), no Meta pixel here.
// If the user left no email, warn them to keep the link.
// See PLAN.md "Página del reporte". TODO: phase 2.
export const Route = createFileRoute("/r/$token")({
  component: ReportPage,
});

function ReportPage() {
  const { token } = Route.useParams();
  return <main>Reporte {token} — TODO phase 2.</main>;
}
