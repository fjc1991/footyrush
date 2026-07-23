import AdminUsersDashboard from "@/components/AdminUsersDashboard";

export default async function AdminUsersPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return <AdminUsersDashboard locale={locale} />;
}
