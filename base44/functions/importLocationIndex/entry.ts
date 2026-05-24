/**
 * importLocationIndex
 * ===================
 * Importiert GeoNames-DE PLZ-Daten aus location_index_active.csv (vorbereinigt).
 * 
 * REGELN:
 * - Nur location_index_active.csv (is_active=true Einträge)
 * - Dedupe nach country_code + postal_code + normalized_name + state_code
 * - lat/lng validieren (Deutschland: lat 47–55, lng 6–15)
 * - Batchgröße 500
 * - special_postal_recipient niemals importieren (bereits in active-Datei gefiltert, aber Doppelschutz)
 * - Admin-only
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const FILE_URL = 'https://media.base44.com/files/public/69d8fb5b8dde510755b29a7e/cb1709b1c_location_index_de_cleaned.zip';

// Einfaches CSV-Parsing (kommagetrennt, handles quoted fields)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeCity(name) {
  if (!name) return '';
  return name.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9\s-]/g, '').trim();
}

function validateDE(lat, lng) {
  return lat >= 47.2 && lat <= 55.1 && lng >= 5.8 && lng <= 15.1;
}

// Chunks ZIP direkt aus der Datei-URL laden und location_index_active.csv extrahieren
// Da Base44 keine native ZIP-Unterstützung hat, nutzen wir einen DecompressionStream-Ansatz
// ABER: ZIP-Format erfordert einen ZIP-Parser. Wir nutzen npm:fflate für das Parsing.
async function fetchAndParseActiveCSV() {
  const { unzipSync } = await import('npm:fflate@0.8.2');

  const resp = await fetch(FILE_URL);
  if (!resp.ok) throw new Error(`ZIP fetch failed: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const uint8 = new Uint8Array(buf);

  const files = unzipSync(uint8);

  // Suche location_index_active.csv (kann in Unterordner sein)
  let csvData = null;
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('location_index_active.csv')) {
      csvData = new TextDecoder('utf-8').decode(data);
      console.info(`[importLocationIndex] Found: ${name} (${data.length} bytes)`);
      break;
    }
  }
  if (!csvData) {
    const availableFiles = Object.keys(files).join(', ');
    throw new Error(`location_index_active.csv nicht in ZIP gefunden. Dateien: ${availableFiles}`);
  }
  return csvData;
}

function csvToRecords(csvText) {
  const lines = csvText.split('\n').filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV hat zu wenig Zeilen');

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/^"|"$/g, '').trim());
  console.info(`[importLocationIndex] CSV-Header: ${headers.join(', ')}`);

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    if (vals.length < 3) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });
    records.push(row);
  }
  return records;
}

// Firmen-/Großempfänger-Erkennung anhand des Ortsnamens
// Die location_index_active.csv hat alle Einträge als location_type=postal_code_city —
// Firmennamen müssen über String-Erkennung gefiltert werden.
const FIRM_SIGNALS_EXACT = [
  'GmbH', ' AG', ' KG', 'e.V.', 'OHG', ' mbH', 'GbR', 'SE', ' eG',
];
const FIRM_SIGNALS_CONTAINS = [
  'Stadtverwaltung', 'Stadtwerke', 'Finanzamt', 'Krankenhaus', 'Klinikum',
  'Universität', 'Hochschule', 'Fachhochschule', 'Postfach', 'Packstation',
  'Bundesamt', 'Landesamt', 'Ministerium', 'Landratsamt', 'Amtsgericht',
  'Deutsche Post', 'Deutsche Bahn', 'DHL', 'Hauptpost', 'Postamt',
  'Berufsgenossenschaft', 'Krankenkasse', 'Pflegekasse', 'AOK', 'BKK', 'TK ',
  'Sparkasse', 'Volksbank', 'Raiffeisen', 'Commerzbank', 'Santander',
  'Bauhaus', 'OBI ', 'IKEA', 'Metro ', 'Kaufland', 'Real ', 'Globus',
  'Überwachung', 'Ordnungswidrigkeiten', '-Bereich-', 'Fachbereich',
  'Verwaltung', 'Technischer Betrieb', 'Eigenbetrieb',
  'HUK-', 'ADAC', 'DEKRA', 'TÜV',
  'Landgericht', 'Amtsgericht', 'Oberlandesgericht', 'Verwaltungsgericht',
  'Rundfunk', 'Fernsehen', 'Verlag', 'Redaktion',
  'Medialog', 'Südwestrundfunk', 'NDR', 'WDR', 'ARD', 'ZDF', 'MDR',
  'Stadtbahn', 'Verkehrsbetrieb', 'Busbahnhof', 'Hauptbahnhof',
  'Betriebshof', 'Kläranlage', 'Wasserwerk', 'Gaswerk',
  'Notariat', 'Grundbuchamt', 'Polizeipräsidium', 'Polizeirevier',
  'Sozialamt', 'Jugendamt', 'Ordnungsamt', 'Steueramt', 'Schulamt',
  'Arbeitsamt', 'Jobcenter', 'Agentur für Arbeit',
  'Kreishaus', 'Rathaus', 'Bürgeramt', 'Stadtrat',
  'Feuerwehr', 'Rettungsdienst', 'Rotes Kreuz',
  'Messe ', 'Congress', 'Kongresszentrum',
  'Logistikzentrum', 'Lager ', 'Depot ',
  'Stadt Mannheim', 'Stadt Frankfurt', 'Stadt Berlin', 'Stadt Hamburg',
  'Stadt München',
  'Staatsanwaltschaft', 'Sozialgericht', 'Arbeitsgericht', 'Verwaltungsgericht',
  'Wasserschutzpolizei', 'Buchhandel', 'Buchhandlung',
  'Industrie- und Handelskammer', 'Handwerkskammer', 'IHK ', 'HWK ',
  'Zollamt', 'Hauptzollamt', 'Zollfahndung',
  'Versicherung', 'Versorgungsbetrieb',
  'Bausparkasse', 'Hypothekenbank',
];
function isFirmEntry(cityName) {
  if (!cityName) return false;
  for (const sig of FIRM_SIGNALS_EXACT) {
    if (cityName.includes(sig)) return true;
  }
  for (const sig of FIRM_SIGNALS_CONTAINS) {
    if (cityName.includes(sig)) return true;
  }
  // Lange Namen mit Satzzeichen (Kommata/Semikolon) → meist Firmenbeschreibungen
  if (cityName.length > 55) return true;
  if ((cityName.match(/,/g) || []).length >= 2) return true;
  // "...direktion...", "...präsidium...", "...gericht..." → Behörden
  if (/direktion|präsidium|gericht|anstalt|einrichtung/i.test(cityName)) return true;
  return false;
}

// Bundesland-Codes die in echter GeoNames-DE-Datei auftreten (ISO 3166-2:DE)
// Numerische state_codes (01, 02, ...) sind GeoNames admin1_codes — keine deutschen BL-Kürzel.
// Echte BL-Kürzel sind: BB, BE, BW, BY, HB, HE, HH, MV, NI, NW, RP, SH, SL, SN, ST, TH
// Ungültige state_codes (rein numerisch, leer) → potentieller Großempfänger
const VALID_DE_STATE_CODES = new Set(['BB','BE','BW','BY','HB','HE','HH','MV','NI','NW','RP','SH','SL','SN','ST','TH']);

function rowToLocationIndex(row, rowNum) {
  // Flexibel: unterstützt verschiedene CSV-Spaltennamen
  const postalCode = (row.postal_code || row.plz || row.postleitzahl || '').replace(/^"|"$/g, '').trim();
  const city = (row.city || row.ort || row.place_name || row.place || '').replace(/^"|"$/g, '').trim();
  const lat = parseFloat(row.lat || row.latitude || '0');
  const lng = parseFloat(row.lng || row.longitude || row.lon || '0');
  const stateCode = (row.state_code || row.admin1_code || row.bundesland_kuerzel || '').trim();
  const state = (row.state || row.admin1_name || row.bundesland || '').trim();
  const district = (row.district || row.admin2_name || row.landkreis || '').trim();
  const districtCode = (row.district_code || row.admin2_code || '').trim();
  const municipality = (row.municipality || row.admin3_name || row.gemeinde || '').trim();
  const municipalityCode = (row.municipality_code || row.admin3_code || row.admin4_code || '').trim();
  const accuracy = parseInt(row.accuracy || row.geo_accuracy || '4') || 4;
  const locationType = (row.location_type || 'postal_code_city').trim();
  const qualityScore = parseFloat(row.quality_score || '80') || 80;
  const isActive = row.is_active !== undefined
    ? (row.is_active === 'true' || row.is_active === '1' || row.is_active === 'True')
    : true;
  const filterReasons = row.filter_reasons || row.filter_reason || null;
  const normalizedName = row.normalized_name || normalizeCity(city);
  const sourceRow = parseInt(row.source_row || rowNum) || rowNum;
  const sourceId = row.source_id || row.geonames_id || '';
  const countryCode = (row.country_code || 'DE').trim();

  return {
    country_code: countryCode,
    postal_code: postalCode,
    city,
    state,
    state_code: stateCode,
    district,
    district_code: districtCode,
    municipality,
    municipality_code: municipalityCode,
    lat,
    lng,
    accuracy,
    location_type: locationType,
    source: 'geonames_postal',
    source_file: 'DE.zip',
    source_row: sourceRow,
    source_id: sourceId,
    normalized_name: normalizedName,
    quality_score: qualityScore,
    is_active: isActive,
    filter_reasons: filterReasons,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin-only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      dry_run = false,         // true = nur validieren, nicht schreiben
      clear_existing = false,  // true = alle vorhandenen Einträge löschen
      batch_size = 500,        // Batchgröße
      max_records = null,      // Für Tests: nur N Datensätze importieren
    } = body;

    console.info(`[importLocationIndex] START dry_run=${dry_run} clear_existing=${clear_existing} batch_size=${batch_size}`);

    // ── Bestehende Einträge löschen wenn gewünscht ────────────────────────
    if (clear_existing && !dry_run) {
      console.info('[importLocationIndex] Lösche bestehende LocationIndex-Einträge...');
      let deleted = 0;
      let page = await base44.asServiceRole.entities.LocationIndex.list('-created_date', 500);
      while (page.length > 0) {
        await Promise.all(page.map(r => base44.asServiceRole.entities.LocationIndex.delete(r.id)));
        deleted += page.length;
        console.info(`[importLocationIndex] Gelöscht: ${deleted}`);
        if (page.length < 500) break;
        page = await base44.asServiceRole.entities.LocationIndex.list('-created_date', 500);
      }
      console.info(`[importLocationIndex] Gelöscht gesamt: ${deleted}`);
    }

    // ── CSV laden und parsen ──────────────────────────────────────────────
    console.info('[importLocationIndex] Lade ZIP-Datei...');
    const csvText = await fetchAndParseActiveCSV();
    const rawRecords = csvToRecords(csvText);
    console.info(`[importLocationIndex] CSV gelesen: ${rawRecords.length} Zeilen`);

    // ── Validierung + Normalisierung ──────────────────────────────────────
    const validRecords = [];
    const skipped = { invalid_geo: 0, missing_key: 0, special_recipient: 0, inactive: 0 };
    const dedupeSet = new Set();

    const limit = max_records ? Math.min(rawRecords.length, max_records) : rawRecords.length;

    for (let i = 0; i < limit; i++) {
      const row = rawRecords[i];
      const rec = rowToLocationIndex(row, i + 2);

      // PFLICHT: postal_code + city + lat/lng
      if (!rec.postal_code || !rec.city) { skipped.missing_key++; continue; }

      // special_postal_recipient niemals importieren
      if (rec.location_type === 'special_postal_recipient') { skipped.special_recipient++; continue; }

      // Firmen-/Institutionskennzeichen im Stadtnamen → als special_recipient markieren (Doppelschutz)
      if (isFirmEntry(rec.city)) {
        skipped.special_recipient++;
        continue;
      }

      // Numerische/ungültige state_code + quality_score < 80 → Großempfänger-Indikator
      // Echte Bundesland-Kürzel (BW, BY, NW ...) sind immer 2 Buchstaben.
      const stateCodeValid = rec.state_code && VALID_DE_STATE_CODES.has(rec.state_code);
      const isNumericStateCode = rec.state_code && /^\d+$/.test(rec.state_code);
      if (isNumericStateCode && rec.quality_score < 80) {
        // state_code ist numerisch (GeoNames admin1_code statt ISO-Kürzel) und quality_score niedrig
        // → sehr wahrscheinlich Großempfänger oder Problemdaten
        skipped.special_recipient++;
        continue;
      }

      // Nur aktive importieren (location_index_active.csv sollte nur is_active=true haben)
      if (!rec.is_active) { skipped.inactive++; continue; }

      // lat/lng validieren
      if (!validateDE(rec.lat, rec.lng)) {
        console.warn(`[importLocationIndex] Ungültige Koordinaten: ${rec.postal_code} ${rec.city} lat=${rec.lat} lng=${rec.lng}`);
        skipped.invalid_geo++;
        continue;
      }

      // Dedupe: country_code + postal_code + normalized_name + state_code
      const dedupeKey = `${rec.country_code}|${rec.postal_code}|${rec.normalized_name}|${rec.state_code}`;
      if (dedupeSet.has(dedupeKey)) continue;
      dedupeSet.add(dedupeKey);

      validRecords.push(rec);
    }

    console.info(`[importLocationIndex] Valid: ${validRecords.length} | Skipped: ${JSON.stringify(skipped)}`);

    if (dry_run) {
      // Auch die problematischen Einträge zeigen (die noch nicht gefiltert sind)
      const suspiciousSample = rawRecords.slice(0, 1000)
        .filter(r => {
          const lt = (r.location_type || '').trim();
          return lt !== 'postal_code_city' && lt !== 'city_only';
        })
        .slice(0, 5);
      return Response.json({
        success: true,
        dry_run: true,
        total_raw: rawRecords.length,
        valid_records: validRecords.length,
        skipped,
        sample: validRecords.slice(0, 5).map(r => ({
          postal_code: r.postal_code, city: r.city, state_code: r.state_code,
          lat: r.lat, lng: r.lng, quality_score: r.quality_score,
          location_type: r.location_type,
        })),
        location_type_distribution: (() => {
          const dist = {};
          for (const r of rawRecords.slice(0, 2000)) {
            const lt = r.location_type || 'unknown';
            dist[lt] = (dist[lt] || 0) + 1;
          }
          return dist;
        })(),
        suspicious_location_types_sample: suspiciousSample.map(r => ({
          postal_code: r.postal_code, city: r.city, location_type: r.location_type, quality_score: r.quality_score,
        })),
      });
    }

    // ── Batchweise importieren ────────────────────────────────────────────
    let imported = 0;
    let errors = 0;
    const batchErrors = [];

    for (let offset = 0; offset < validRecords.length; offset += batch_size) {
      const batch = validRecords.slice(offset, offset + batch_size);
      const batchNum = Math.floor(offset / batch_size) + 1;
      const totalBatches = Math.ceil(validRecords.length / batch_size);

      try {
        await base44.asServiceRole.entities.LocationIndex.bulkCreate(batch);
        imported += batch.length;
        console.info(`[importLocationIndex] Batch ${batchNum}/${totalBatches} importiert: ${batch.length} Einträge (gesamt: ${imported})`);
      } catch (batchErr) {
        console.error(`[importLocationIndex] Batch ${batchNum} Fehler:`, batchErr?.message);
        errors += batch.length;
        batchErrors.push({ batch: batchNum, error: batchErr?.message });
      }
    }

    console.info(`[importLocationIndex] FERTIG: imported=${imported} errors=${errors}`);

    return Response.json({
      success: true,
      total_raw: rawRecords.length,
      valid_records: validRecords.length,
      imported,
      errors,
      skipped,
      batch_errors: batchErrors.length > 0 ? batchErrors : undefined,
      message: `Import abgeschlossen: ${imported} aktive PLZ-/Ortseinträge importiert.`,
    });

  } catch (error) {
    console.error('[importLocationIndex] FEHLER:', error?.message, error?.stack);
    return Response.json({ error: error?.message, success: false }, { status: 500 });
  }
});