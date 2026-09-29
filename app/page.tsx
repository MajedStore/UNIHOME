import Dashboard from "@/components/dashboard";
export const dynamic = "force-dynamic";
export default function Page() {
  return <Dashboard demoMode={process.env.DEMO_MODE === "true"} />;
}
