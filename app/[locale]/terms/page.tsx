import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { legalCopy, legalLocales, resolveLegalLocale } from "@/lib/legal";

export function generateStaticParams() {
  return legalLocales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = resolveLegalLocale(requestedLocale);
  const document = legalCopy[locale].documents.terms;

  return {
    title: document.title,
    description: document.summary,
    alternates: {
      canonical: `/${locale}/terms`,
      languages: Object.fromEntries(legalLocales.map((language) => [language, `/${language}/terms`]))
    }
  };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LegalPage locale={resolveLegalLocale(locale)} kind="terms" />;
}
