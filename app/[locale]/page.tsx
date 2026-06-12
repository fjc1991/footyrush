import FootyRushApp from "@/components/FootyRushApp";
import { getDictionary } from "@/lib/i18n";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "es" }, { locale: "fr" }, { locale: "pt" }];
}

export default async function LocalePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const copy = getDictionary(locale);
  return <FootyRushApp copy={copy} locale={locale} />;
}
