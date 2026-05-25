/**
 * geocodeCity – Proxy für Google Places Autocomplete + Place Details
 * Verwendet den Backend GOOGLE_PLACES_API_KEY (bleibt geheim).
 * 
 * POST /geocodeCity
 * Body: { action: "autocomplete", input: "Neuwied" }
 *    OR { action: "details", place_id: "ChIJ..." }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const GOOGLE_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { action, input, place_id } = body;

    if (action === "autocomplete") {
      if (!input || input.length < 2) return Response.json({ predictions: [] });

      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=(cities)&language=de&components=country:de&key=${GOOGLE_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
        console.error("[geocodeCity] Autocomplete error:", data.status, data.error_message);
        return Response.json({ predictions: [], error: data.status });
      }

      const predictions = (data.predictions || []).map(p => ({
        place_id: p.place_id,
        label: p.description,
        city: p.structured_formatting?.main_text || p.description.split(",")[0].trim(),
      }));

      return Response.json({ predictions });

    } else if (action === "details") {
      if (!place_id) return Response.json({ error: "place_id fehlt" }, { status: 400 });

      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&fields=place_id,name,formatted_address,geometry,address_components&language=de&key=${GOOGLE_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.status !== "OK") {
        console.error("[geocodeCity] Details error:", data.status);
        return Response.json({ error: data.status }, { status: 400 });
      }

      const r = data.result;
      const lat = r.geometry?.location?.lat;
      const lng = r.geometry?.location?.lng;

      // Stadt-Name aus address_components extrahieren
      let city = r.name || "";
      const ac = r.address_components || [];
      const localityComp = ac.find(c => c.types.includes("locality"));
      if (localityComp) city = localityComp.long_name;

      return Response.json({
        place_id: r.place_id,
        label: r.formatted_address,
        city,
        lat,
        lng,
        country: "DE",
      });

    } else {
      return Response.json({ error: "Unbekannte Action. Erlaubt: autocomplete, details" }, { status: 400 });
    }

  } catch (error) {
    console.error("[geocodeCity] Error:", error?.message);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});