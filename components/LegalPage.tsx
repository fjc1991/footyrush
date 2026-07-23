import Link from "next/link";
import { legalCopy, type LegalKind, type LegalLocale } from "@/lib/legal";

export default function LegalPage({ locale, kind }: { locale: LegalLocale; kind: LegalKind }) {
  const copy = legalCopy[locale];
  const document = copy.documents[kind];

  return (
    <main className="legal-shell">
      <header className="legal-topbar">
        <Link className="legal-brand" href={`/${locale}`} aria-label={copy.homeAria}>
          <span className="legal-brand-mark" aria-hidden="true">FR</span>
          <span>
            <strong>FOOTYRUSH</strong>
            <small>Draft your XI. Chase the table.</small>
          </span>
        </Link>
        <nav className="legal-nav" aria-label="Legal">
          <Link aria-current={kind === "privacy" ? "page" : undefined} href={`/${locale}/privacy`}>
            {copy.privacyLink}
          </Link>
          <Link aria-current={kind === "terms" ? "page" : undefined} href={`/${locale}/terms`}>
            {copy.termsLink}
          </Link>
        </nav>
      </header>

      <div className="legal-layout">
        <aside className="legal-summary" aria-labelledby="legal-title">
          <p className="eyebrow">{document.eyebrow}</p>
          <h1 id="legal-title">{document.title}</h1>
          <p>{document.summary}</p>
          <div className="legal-effective">
            <span>{document.updatedLabel}</span>
            <time dateTime="2026-07-22">{document.updatedDate}</time>
          </div>
          <Link className="secondary-button legal-home-link" href={`/${locale}`}>
            <span aria-hidden="true">←</span> {copy.home}
          </Link>
        </aside>

        <article className="legal-document">
          {document.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.bullets ? (
                <ul>
                  {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                </ul>
              ) : null}
            </section>
          ))}
        </article>
      </div>

      <footer className="legal-footer">
        <span>{copy.footer}</span>
        <nav aria-label="Legal footer">
          <Link href={`/${locale}/privacy`}>{copy.privacyLink}</Link>
          <Link href={`/${locale}/terms`}>{copy.termsLink}</Link>
          <a href="mailto:support@footyrush.app">{copy.contact}</a>
        </nav>
      </footer>
    </main>
  );
}
