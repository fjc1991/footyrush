import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { legalCopy, legalLocales, resolveLegalLocale } from "@/lib/legal";

export function generateStaticParams() {
  return legalLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = resolveLegalLocale(requestedLocale);
  const document = legalCopy[locale].documents.privacy;

  return {
    title: document.title,
    description: document.summary,
    alternates: {
      canonical: `/${locale}/privacy`,
      languages: Object.fromEntries(legalLocales.map((language) => [language, `/${language}/privacy`]))
    }
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LegalPage locale={resolveLegalLocale(locale)} kind="privacy" />;
}
