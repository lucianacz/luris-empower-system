import { redirect } from "next/navigation";
import { EmpowerDashboard } from "@/components/empower-dashboard";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <EmpowerDashboard />;
}
