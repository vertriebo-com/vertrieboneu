import SEOFooter from "@/components/SEOFooter";

export default function Impressum() {
  return (
    <div className="min-h-screen bg-slate-50" style={{ background: "#020617", color: "white" }}>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <a href="/" className="text-sm text-blue-600 hover:underline mb-8 inline-block">← Zurück zur Startseite</a>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Impressum</h1>
        <p className="text-sm text-slate-500 mb-10">Angaben gemäß § 5 DDG (Digitale-Dienste-Gesetz)</p>

        <div className="space-y-8 text-sm text-slate-700 leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Anbieter & Verantwortlicher</h2>
            <p>
              <strong>Huwa Gebäudereinigung & Hausmeisterdienste</strong><br />
              Mittelweg 24<br />
              56566 Neuwied<br />
              Deutschland
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Kontakt</h2>
            <p>
              Telefon: <a href="tel:026019131820" className="text-blue-600 hover:underline">02601/9131820</a><br />
              E-Mail: <a href="mailto:info@vertriebo.com" className="text-blue-600 hover:underline">info@vertriebo.com</a><br />
              Website: <a href="https://vertriebo.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">vertriebo.com</a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Umsatzsteuer-Identifikationsnummer</h2>
            <p>
              Umsatzsteuer-Identifikationsnummer gemäß § 27a Umsatzsteuergesetz:<br />
              <span className="text-slate-500 italic">Auf Anfrage erhältlich – bitte kontaktieren Sie uns per E-Mail.</span>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Inhaltlich Verantwortlicher</h2>
            <p>
              Verantwortlich für den Inhalt nach § 55 Abs. 2 RStV:<br />
              Huwa Gebäudereinigung & Hausmeisterdienste<br />
              Mittelweg 24, 56566 Neuwied
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Gewerbeanmeldung</h2>
            <p>
              Das Unternehmen ist im Handels-/Gewerberegister eingetragen. Registergericht und -nummer sind auf Anfrage erhältlich.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Online-Streitbeilegung</h2>
            <p>
              Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit:{" "}
              <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                https://ec.europa.eu/consumers/odr/
              </a>
              <br /><br />
              Wir sind nicht bereit oder verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen, da wir ausschließlich gegenüber Unternehmern (B2B) tätig sind.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Haftung für Inhalte</h2>
            <p>
              Als Diensteanbieter sind wir gemäß § 7 Abs. 1 DDG für eigene Inhalte auf diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8 bis 10 DDG sind wir als Diensteanbieter jedoch nicht verpflichtet, übermittelte oder gespeicherte fremde Informationen zu überwachen oder nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit hinweisen.
            </p>
            <p className="mt-2">
              Verpflichtungen zur Entfernung oder Sperrung der Nutzung von Informationen nach den allgemeinen Gesetzen bleiben hiervon unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem Zeitpunkt der Kenntnis einer konkreten Rechtsverletzung möglich. Bei Bekanntwerden von entsprechenden Rechtsverletzungen werden wir diese Inhalte umgehend entfernen.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Haftung für Links</h2>
            <p>
              Unser Angebot enthält Links zu externen Websites Dritter, auf deren Inhalte wir keinen Einfluss haben. Deshalb können wir für diese fremden Inhalte auch keine Gewähr übernehmen. Für die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber der Seiten verantwortlich.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">Urheberrecht</h2>
            <p>
              Die durch die Seitenbetreiber erstellten Inhalte und Werke auf diesen Seiten unterliegen dem deutschen Urheberrecht. Die Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung außerhalb der Grenzen des Urheberrechtes bedürfen der schriftlichen Zustimmung des jeweiligen Autors bzw. Erstellers. Downloads und Kopien dieser Seite sind nur für den privaten, nicht kommerziellen Gebrauch gestattet.
            </p>
          </section>

          <p className="text-xs text-slate-400 pt-4 border-t border-slate-200" style={{ color: "rgba(71,85,105,1)" }}>Stand: Mai 2026 · Vertriebo – ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste</p>
        </div>
      </div>
      <SEOFooter />
    </div>
  );
}