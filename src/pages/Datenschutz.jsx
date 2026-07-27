export default function Datenschutz() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <a href="/" className="text-sm text-blue-600 hover:underline mb-8 inline-block">← Zurück zur Startseite</a>
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Datenschutzerklärung</h1>
        <p className="text-sm text-slate-500 mb-10">Stand: Mai 2026</p>

        <div className="space-y-10 text-sm text-slate-700 leading-relaxed">

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">1. Verantwortlicher</h2>
            <p>
              Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) ist:<br /><br />
              <strong>Huwa Gebäudereinigung & Hausmeisterdienste</strong><br />
              Mittelweg 24<br />
              56566 Neuwied<br />
              Deutschland<br /><br />
              Telefon: 02601/9131820<br />
              E-Mail: <a href="mailto:info@vertriebo.com" className="text-blue-600 hover:underline">info@vertriebo.com</a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">2. Überblick der Verarbeitungen</h2>
            <p className="mb-3">Die folgende Übersicht fasst zusammen, welche Arten von Daten wir verarbeiten und zu welchen Zwecken:</p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Kategorie</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Zweck</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Rechtsgrundlage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="px-3 py-2">Server-Logfiles (IP, Browser)</td><td className="px-3 py-2">Betrieb & Sicherheit</td><td className="px-3 py-2">Art. 6 Abs. 1 lit. f DSGVO</td></tr>
                  <tr><td className="px-3 py-2">Account-Daten (E-Mail, Name)</td><td className="px-3 py-2">Vertragserfüllung</td><td className="px-3 py-2">Art. 6 Abs. 1 lit. b DSGVO</td></tr>
                  <tr><td className="px-3 py-2">Zahlungsdaten</td><td className="px-3 py-2">Abrechnung via Stripe</td><td className="px-3 py-2">Art. 6 Abs. 1 lit. b DSGVO</td></tr>
                  <tr><td className="px-3 py-2">CRM-Daten (Firmenkontakte)</td><td className="px-3 py-2">Vertragserfüllung (SaaS)</td><td className="px-3 py-2">Art. 6 Abs. 1 lit. b DSGVO</td></tr>
                  <tr><td className="px-3 py-2">Notwendige Cookies</td><td className="px-3 py-2">Session & Login</td><td className="px-3 py-2">Art. 6 Abs. 1 lit. f DSGVO</td></tr>
                  <tr><td className="px-3 py-2">Analyse-Cookies (optional)</td><td className="px-3 py-2">Nutzungsstatistik</td><td className="px-3 py-2">Art. 6 Abs. 1 lit. a DSGVO (Einwilligung)</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">3. Erhebung von Daten beim Website-Besuch</h2>
            <p>
              Beim Aufrufen unserer Website werden automatisch Informationen in sogenannten Server-Log-Dateien gespeichert. Dies sind:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Browsertyp und -version</li>
              <li>Verwendetes Betriebssystem</li>
              <li>Referrer-URL (die zuvor besuchte Seite)</li>
              <li>Hostname und IP-Adresse des zugreifenden Geräts (anonymisiert)</li>
              <li>Uhrzeit der Serveranfrage</li>
            </ul>
            <p className="mt-3">
              Diese Daten werden nicht mit anderen Datenquellen zusammengeführt und nach spätestens 7 Tagen automatisch gelöscht. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO (berechtigtes Interesse am sicheren Betrieb der Website).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">4. Cookies und Einwilligungsmanagement</h2>
            <p className="mb-3">Wir verwenden Cookies und ähnliche Technologien. Beim ersten Besuch erscheint ein Cookie-Banner, in dem Sie Ihre Auswahl treffen können. Ihre Entscheidung wird im lokalen Speicher Ihres Browsers gespeichert, sodass das Banner nicht bei jedem Besuch erneut erscheint.</p>

            <h3 className="font-bold text-slate-900 mb-2 mt-4">4.1 Notwendige Cookies (immer aktiv)</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200 mb-3">
              <table className="w-full text-xs">
                <thead className="bg-slate-100">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Cookie</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Zweck</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-700">Speicherdauer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="px-3 py-2">Session-Cookie (auth)</td><td className="px-3 py-2">Authentifizierung & Login-Status</td><td className="px-3 py-2">Sitzungsende / 30 Tage</td></tr>
                  <tr><td className="px-3 py-2">vertriebo_cookie_consent</td><td className="px-3 py-2">Speichert Ihre Cookie-Einstellungen</td><td className="px-3 py-2">12 Monate (localStorage)</td></tr>
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-500">Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO – Diese Cookies sind für den Betrieb technisch unerlässlich.</p>

            <h3 className="font-bold text-slate-900 mb-2 mt-4">4.2 Analyse-Cookies (optional, nur mit Einwilligung)</h3>
            <p>Falls Sie Analyse-Cookies akzeptieren, können anonymisierte Nutzungsdaten erfasst werden, um die Website zu verbessern. Aktuell werden keine externen Analyse-Dienste (z. B. Google Analytics) eingesetzt. Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO.</p>

            <h3 className="font-bold text-slate-900 mb-2 mt-4">4.3 Marketing-Cookies (optional, nur mit Einwilligung)</h3>
            <p>Aktuell werden keine Marketing- oder Tracking-Cookies von Drittanbietern eingesetzt. Sollte sich dies ändern, werden Sie vorab um Einwilligung gebeten. Rechtsgrundlage: Art. 6 Abs. 1 lit. a DSGVO.</p>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              <strong>Cookie-Einstellungen ändern:</strong> Sie können Ihre Einwilligung jederzeit widerrufen, indem Sie den lokalen Speicher Ihres Browsers löschen. Eine Widerrufsmöglichkeit über ein Präferenz-Center ist in Vorbereitung.
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">5. Nutzung der SaaS-Software (Registrierung)</h2>
            <p>
              Bei der Registrierung und Nutzung von Vertriebo erheben wir folgende Daten:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Name und E-Mail-Adresse (für den Account)</li>
              <li>Rechnungs- und Zahlungsdaten (verarbeitet durch Stripe)</li>
              <li>Von Ihnen eingegebene Geschäftsdaten (Firmenkontakte, Notizen, Aufgaben etc.)</li>
              <li>Nutzungsdaten (Login-Zeitstempel, Aktionen in der Software)</li>
            </ul>
            <p className="mt-3">Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung). Die Daten werden gelöscht, sobald das Abonnement endet und die gesetzlichen Aufbewahrungsfristen abgelaufen sind.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">6. Zahlungsabwicklung – Stripe</h2>
            <p>
              Für die Zahlungsabwicklung nutzen wir <strong>Stripe</strong> (Stripe Payments Europe, Ltd., 1 Grand Canal Street Lower, Grand Canal Dock, Dublin, D02 H210, Ireland sowie Stripe, Inc., 510 Townsend Street, San Francisco, CA 94103, USA).
            </p>
            <p className="mt-2">
              Stripe verarbeitet Zahlungsdaten als eigenverantwortlicher Verantwortlicher. Die Datenübertragung in die USA erfolgt auf Basis der Standardvertragsklauseln (SCC) der EU-Kommission und des EU-US Data Privacy Frameworks.
            </p>
            <p className="mt-2">
              Stripe-Datenschutz: <a href="https://stripe.com/de/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">https://stripe.com/de/privacy</a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">7. Hosting & Infrastruktur</h2>
            <p>
              Diese Website wird auf Servern von <strong>Base44</strong> gehostet. Die Server befinden sich innerhalb der EU. Mit Base44 besteht ein Auftragsverarbeitungsvertrag gemäß Art. 28 DSGVO. Rechtsgrundlage: Art. 6 Abs. 1 lit. f DSGVO.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">8. Auftragsverarbeitung (AVV)</h2>
            <p>
              Wir als Anbieter von Vertriebo handeln gegenüber unseren Kunden (die die Software zur Verwaltung von Firmenkontakten nutzen) als <strong>Auftragsverarbeiter</strong> im Sinne des Art. 28 DSGVO. Auf Anfrage stellen wir Ihnen einen Auftragsverarbeitungsvertrag (AVV) zur Verfügung. Bitte wenden Sie sich dazu an <a href="mailto:info@vertriebo.com" className="text-blue-600 hover:underline">info@vertriebo.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">9. Weitergabe an Dritte</h2>
            <p>
              Ihre personenbezogenen Daten werden nicht an Dritte weitergegeben, außer:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>zur Zahlungsabwicklung (Stripe – siehe Abschnitt 6)</li>
              <li>wenn wir gesetzlich dazu verpflichtet sind (z. B. auf behördliche Anordnung)</li>
              <li>mit Ihrem ausdrücklichen Einverständnis</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">10. Speicherdauer</h2>
            <p>
              Ihre personenbezogenen Daten werden nur so lange gespeichert, wie es für die genannten Zwecke notwendig ist oder gesetzliche Aufbewahrungspflichten bestehen:
            </p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Account-Daten: bis zur Kündigung + 30 Tage</li>
              <li>Rechnungsdaten: 10 Jahre (steuerrechtliche Aufbewahrungspflicht)</li>
              <li>Server-Logs: max. 7 Tage</li>
              <li>Cookie-Einwilligung: 12 Monate im lokalen Speicher</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">11. Ihre Rechte als betroffene Person</h2>
            <p>Ihnen stehen folgende Rechte nach der DSGVO zu:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong>Auskunft</strong> (Art. 15 DSGVO): Sie können Auskunft über Ihre bei uns gespeicherten Daten verlangen.</li>
              <li><strong>Berichtigung</strong> (Art. 16 DSGVO): Sie können die Berichtigung unrichtiger Daten verlangen.</li>
              <li><strong>Löschung</strong> (Art. 17 DSGVO): Sie können die Löschung Ihrer Daten verlangen, sofern keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</li>
              <li><strong>Einschränkung der Verarbeitung</strong> (Art. 18 DSGVO)</li>
              <li><strong>Datenübertragbarkeit</strong> (Art. 20 DSGVO): Sie haben das Recht, Ihre Daten in einem maschinenlesbaren Format zu erhalten.</li>
              <li><strong>Widerspruch</strong> (Art. 21 DSGVO): Sie können der Verarbeitung Ihrer Daten auf Basis des berechtigten Interesses widersprechen.</li>
              <li><strong>Widerruf von Einwilligungen</strong> (Art. 7 Abs. 3 DSGVO): Erteilte Einwilligungen können jederzeit mit Wirkung für die Zukunft widerrufen werden.</li>
            </ul>
            <p className="mt-3">
              Zur Ausübung Ihrer Rechte wenden Sie sich an: <a href="mailto:info@vertriebo.com" className="text-blue-600 hover:underline">info@vertriebo.com</a>
            </p>
            <p className="mt-2">
              Sie haben außerdem das Recht, sich bei der zuständigen Datenschutz-Aufsichtsbehörde zu beschweren. Die zuständige Behörde für Rheinland-Pfalz ist der <strong>Landesbeauftragte für den Datenschutz und die Informationsfreiheit Rheinland-Pfalz</strong>, Hintere Bleiche 34, 55116 Mainz, <a href="https://www.datenschutz.rlp.de" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">www.datenschutz.rlp.de</a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">12. Datensicherheit</h2>
            <p>
              Wir setzen technische und organisatorische Maßnahmen (TOMs) ein, um Ihre Daten zu schützen. Die Datenübertragung erfolgt ausschließlich über SSL/TLS-verschlüsselte Verbindungen (HTTPS). Zugangsdaten werden sicher gehasht gespeichert. Produktionssysteme sind von Entwicklungsumgebungen getrennt.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-slate-900 mb-3">13. Änderungen dieser Datenschutzerklärung</h2>
            <p>
              Wir behalten uns vor, diese Datenschutzerklärung bei Bedarf anzupassen, um sie aktuellen rechtlichen Anforderungen zu entsprechen oder Änderungen unserer Dienste abzubilden. Die jeweils aktuelle Version ist unter <a href="/datenschutz" className="text-blue-600 hover:underline">vertriebo.de/datenschutz</a> abrufbar.
            </p>
          </section>

          <p className="text-xs text-slate-400 pt-4 border-t border-slate-200">Stand: Mai 2026 · Vertriebo – ein Produkt der Huwa Gebäudereinigung & Hausmeisterdienste</p>
        </div>
      </div>
    </div>
  );
}