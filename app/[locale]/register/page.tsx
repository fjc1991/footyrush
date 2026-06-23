import RegistrationPage from "@/components/RegistrationPage";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "es" }, { locale: "fr" }, { locale: "pt" }];
}

export default async function LocaleRegisterPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <RegistrationPage locale={locale} />;
}
