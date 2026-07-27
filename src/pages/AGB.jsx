export default function AGB() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <a href="/" className="text-sm text-blue-600 hover:underline mb-8 inline-block">← Zurück zur Startseite</a>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Allgemeine Geschäftsbedingungen (AGB)</h1>
        <p className="text-sm text-slate-500 mb-10">Stand: Mai 2026</p>

        <div className="space-y-8 text-sm text-slate-700 leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 1 Geltungsbereich und Vertragsparteien</h2>
            <p>
              Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle Verträge zwischen
            </p>
            <p className="mt-2 pl-4 border-l-4 border-blue-200">
              <strong>Huwa Gebäudereinigung & Hausmeisterdienste</strong><br />
              Mittelweg 24, 56566 Neuwied<br />
              E-Mail: info@vertriebo.com<br />
              (nachfolgend „Anbieter")
            </p>
            <p className="mt-3">und dem Kunden (nachfolgend „Nutzer") über die Nutzung der SaaS-Software „<strong>Vertriebo</strong>" – einer webbasierten CRM- und Vertriebssoftware für B2B-Dienstleister.</p>
            <p className="mt-2">
              Vertragsbedingungen des Nutzers finden keine Anwendung, es sei denn, der Anbieter stimmt ihrer Geltung ausdrücklich schriftlich zu. Diese AGB gelten ausschließlich für Unternehmer (§ 14 BGB), nicht für Verbraucher.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 2 Vertragsgegenstand / Leistungsbeschreibung</h2>
            <p>
              Der Anbieter stellt dem Nutzer eine webbasierte CRM- und Vertriebssoftware als Software-as-a-Service (SaaS) über das Internet zur Verfügung. Der konkrete Leistungsumfang richtet sich nach dem gewählten Abonnementplan (Starter, Professional, Gold, Agency) gemäß der jeweils aktuellen Leistungsbeschreibung auf <a href="https://vertriebo.de" className="text-blue-600 hover:underline">vertriebo.de</a>.
            </p>
            <p className="mt-2">Die Software umfasst insbesondere:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Automatische Firmenkontakt-Recherche (KI-gestützt)</li>
              <li>CRM-Funktionen (Kontaktverwaltung, Pipeline, Aufgaben)</li>
              <li>KI-Priorisierung und -Analyse von Leads</li>
              <li>Kommunikationsfunktionen (E-Mail-Integration)</li>
              <li>Reporting und Statistiken</li>
            </ul>
            <p className="mt-2">
              Der Anbieter ist berechtigt, die Software regelmäßig weiterzuentwickeln und zu aktualisieren. Wesentliche Leistungsänderungen werden dem Nutzer mit angemessener Frist mitgeteilt.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 3 Vertragsschluss</h2>
            <p>
              Der Vertrag kommt durch den Abschluss des Online-Checkouts und die Bestätigung der Zahlung zustande. Der Nutzer erhält eine E-Mail-Bestätigung als Vertragsbeleg.
            </p>
            <p className="mt-2">Voraussetzungen für den Vertragsschluss:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Der Nutzer muss volljährig und geschäftsfähig sein</li>
              <li>Die Angaben im Bestellvorgang müssen vollständig und wahrheitsgemäß sein</li>
              <li>Die Nutzung erfolgt ausschließlich für gewerbliche Zwecke (B2B)</li>
              <li>Der Nutzer muss diese AGB sowie die Datenschutzerklärung akzeptieren</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 4 Preise, Zahlung und Abrechnung</h2>
            <p>
              Die jeweils aktuellen Preise sind auf der Website des Anbieters einsehbar. Alle Preise sind Nettopreise zzgl. der gesetzlichen Mehrwertsteuer.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Die Abrechnung erfolgt monatlich im Voraus über den Zahlungsdienstleister Stripe</li>
              <li>Zahlungsmittel: Kreditkarte, SEPA-Lastschrift und weitere von Stripe angebotene Methoden</li>
              <li>Bei Zahlungsverzug von mehr als 5 Tagen behält sich der Anbieter vor, den Zugang zu sperren</li>
              <li>Rückerstattungen werden nach billigem Ermessen gewährt, sind jedoch nicht garantiert</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 5 Laufzeit und Kündigung</h2>
            <p>
              Der Vertrag läuft auf unbestimmte Zeit und ist monatlich zum Ende des laufenden Abrechnungsmonats kündbar.
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Kündigung durch den Nutzer: über das Kundenportal (Einstellungen → Abo) oder per E-Mail an <a href="mailto:info@vertriebo.com" className="text-blue-600 hover:underline">info@vertriebo.com</a></li>
              <li>Nach Kündigung bleibt der Zugang bis zum Ende des bezahlten Zeitraums aktiv</li>
              <li>Daten werden 30 Tage nach Vertragsende zur Abholung bereitgestellt und anschließend gelöscht</li>
              <li>Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt</li>
            </ul>
            <p className="mt-2">
              Der Anbieter kann den Vertrag außerordentlich kündigen, insbesondere bei: schwerem Verstoß gegen diese AGB, missbräuchlicher Nutzung, oder Verwendung der Software für illegale Zwecke.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 6 Nutzungsrechte</h2>
            <p>
              Der Anbieter gewährt dem Nutzer ein einfaches, nicht übertragbares, nicht unterlizenzierbares Recht zur Nutzung der Software für interne Geschäftszwecke während der Vertragslaufzeit.
            </p>
            <p className="mt-2">Nicht gestattet sind insbesondere:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Weitergabe, Vermietung oder Weiterverkauf der Software oder Zugangsdaten</li>
              <li>Reverse Engineering, Dekompilierung oder Extraktion des Quellcodes</li>
              <li>Überlasten der Systeme (z. B. automatisiertes Massen-Scraping)</li>
              <li>Nutzung durch mehr Benutzer als im Tarif vorgesehen</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 7 Verfügbarkeit und Support</h2>
            <p>
              Der Anbieter strebt eine Verfügbarkeit von 99 % im Jahresmittel an, gemessen auf Monatsbasis, ausgenommen geplante Wartungsarbeiten (Wartungsfenster werden nach Möglichkeit vorab angekündigt).
            </p>
            <p className="mt-2">Ein Rechtsanspruch auf ununterbrochene Verfügbarkeit besteht nicht. Support wird per E-Mail angeboten; Reaktionszeiten sind abhängig vom jeweiligen Tarif.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 8 Pflichten des Nutzers</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Der Nutzer ist verantwortlich für die Rechtmäßigkeit der von ihm in die Software eingegebenen Daten (insbesondere für die Verwendung von Firmenkontakten im Rahmen des Datenschutzes)</li>
              <li>Zugangsdaten sind vertraulich zu behandeln und vor unbefugtem Zugriff zu schützen</li>
              <li>Änderungen der Kontaktdaten (E-Mail) sind unverzüglich zu melden</li>
              <li>Die Software darf nicht für illegale Zwecke oder zur Belästigung Dritter genutzt werden</li>
              <li>Bei Kenntnis einer Sicherheitslücke ist der Anbieter unverzüglich zu informieren</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 9 Datenschutz und Auftragsverarbeitung</h2>
            <p>
              Die Verarbeitung personenbezogener Daten des Nutzers (Account-Daten) erfolgt gemäß unserer <a href="/datenschutz" className="text-blue-600 hover:underline">Datenschutzerklärung</a> und den Anforderungen der DSGVO.
            </p>
            <p className="mt-2">
              Hinsichtlich der vom Nutzer in die Software eingegebenen Daten (z. B. Firmenkontakte, Notizen) handelt der Anbieter als <strong>Auftragsverarbeiter</strong> gemäß Art. 28 DSGVO. Der Nutzer ist in diesem Verhältnis der Verantwortliche. Auf Anfrage wird ein Auftragsverarbeitungsvertrag (AVV) bereitgestellt.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 10 Haftungsbeschränkung</h2>
            <p>
              Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie für Schäden, die auf vorsätzlichem oder grob fahrlässigem Verhalten beruhen.
            </p>
            <p className="mt-2">
              Im Übrigen ist die Haftung für einfache Fahrlässigkeit – soweit gesetzlich zulässig – auf den Betrag begrenzt, den der Nutzer in den letzten 12 Monaten vor dem Schadensereignis für die Nutzung der Software bezahlt hat.
            </p>
            <p className="mt-2">
              Der Anbieter haftet nicht für: Datenverlust durch Fehler des Nutzers, entgangene Gewinne, mittelbare Schäden oder Schäden durch höhere Gewalt.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 11 Änderungen der AGB</h2>
            <p>
              Der Anbieter behält sich vor, diese AGB mit einer Ankündigungsfrist von 30 Tagen zu ändern. Änderungen werden dem Nutzer per E-Mail an die hinterlegte Adresse mitgeteilt. Widerspricht der Nutzer den Änderungen nicht innerhalb von 14 Tagen nach Zugang der Mitteilung, gelten die geänderten AGB als angenommen. Auf dieses Widerspruchsrecht und die Folgen des Schweigens wird in der Mitteilung ausdrücklich hingewiesen.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 12 Anwendbares Recht und Gerichtsstand</h2>
            <p>
              Es gilt deutsches Recht unter Ausschluss des UN-Kaufrechts (CISG).
            </p>
            <p className="mt-2">
              Gerichtsstand für alle Streitigkeiten aus oder im Zusammenhang mit diesem Vertrag ist, soweit der Nutzer Kaufmann, eine juristische Person des öffentlichen Rechts oder ein öffentlich-rechtliches Sondervermögen ist, <strong>Neuwied, Deutschland</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">§ 13 Salvatorische Klausel</h2>
            <p>
              Sollten einzelne Bestimmungen dieser AGB unwirksam oder undurchführbar sein oder werden, bleibt die Wirksamkeit der übrigen Bestimmungen davon unberührt. Die unwirksame Bestimmung ist durch eine wirksame zu ersetzen, die dem wirtschaftlichen Zweck der unwirksamen möglichst nahekommt.
            </p>
          </section>

          <p className="text-xs text-slate-400 pt-4 border-t border-slate-200">Stand: Mai 2026 · Vertriebo – ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste</p>
        </div>
      </div>
    </div>
  );
}