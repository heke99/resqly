import { redirect } from "next/navigation";

export default async function StartPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const partner = typeof sp.partner === "string" ? sp.partner : typeof sp.tenant === "string" ? sp.tenant : null;
  if (partner) redirect(`/partner/${partner}`);
  redirect("/");
}
