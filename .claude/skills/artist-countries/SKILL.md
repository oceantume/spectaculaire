---
description: Resolve artist country/origin data for a festival and write it to field-overrides.json. Used to enable the filter-quebec feature when the festival's data source doesn't include country information.
---

# Artist Countries

Festival slug: $ARGUMENTS

Resolve the country of origin for each artist in the festival and write results to `src/data/festivals/{slug}/field-overrides.json`. Follow these steps in order.

## 1. Read existing data

- Load `src/data/festivals/{slug}/artist-details.json` — contains `description` (bio text) for each artist.
- Load `src/data/festivals/{slug}/field-overrides.json` if it exists — skip artists already present there.
- Load `src/data/festivals/{slug}/schedule.json` — use for the artist name list (some artists may appear in the schedule but have no bio).

## 2. Bio text extraction (fast, no network)

Scan each artist's `description` for origin signals. This is the first pass and covers most cases. Look for:

**Québec signals** (→ `"Québec"`):
- Demonyms: québécois, québécoise, montréalais, montréalaise, trifluvien, trifluvienne, gatinois, gatinoise
- Explicit labels: "artiste québécois", "artiste québécoise", "groupe québécois"
- Cities: Montréal, Québec, Laval, Longueuil, Trois-Rivières, Sherbrooke, Gatineau, Lévis, Saguenay, Alma, Baie-Saint-Paul, Rimouski, Rouyn-Noranda, Abitibi, Mauricie, Lanaudière, Estrie, Gaspésie, Beauce, Boucherville, Terrebonne, Repentigny, Joliette, Saint-Hyacinthe, Drummondville, Granby, Victoriaville, Shawinigan, Maniwaki, Beauharnois, St-Tite, Wemotaci, Mashteuiatsh, Anse-Saint-Jean
- Neighborhoods: "Basse-Ville" (Quebec City's Lower Town, common in QC punk/indie scene bios)
- Phrases: "scène musicale québécoise", "du Québec", "originaire de [QC city]", "natif de [QC city]", "né(e) à [QC city]", "basé(e) au Québec", "installé(e) au Québec", "à travers le Québec" (as operational base, not just tour stops)
- Prizes/institutions: ADISQ, Gala de l'ADISQ, Félix (award), GAMIQ, Francouvertes, Radio-Canada Révélation, Prix Polaris (when QC context), école de la chanson de Granby
- Social media: area code 514 in handle (e.g. "djname514") → Montréal signal

**France signals** (→ `"France"`):
- Demonyms: français, française, parisien, parisienne
- Cities: Paris, Lyon, Marseille, Bordeaux, Toulouse, Nantes, Lille, Strasbourg, Rennes
- Phrases: "scène française", "originaire de France", "rock hexagonale" (hexagonale = mainland France)

**Belgium signals** (→ `"Belgique"`):
- Demonyms: belge
- Cities: Bruxelles, Liège, Anvers, Gand

**USA signals** (→ `"États-Unis"`):
- Demonyms: américain, américaine
- States/cities: californien, californienne, New York, Los Angeles, Chicago, New Jersey, Texas, Nashville, Atlanta, Seattle, Boston, Miami, Philadelphia
- Phrases: "scène américaine", "originaire des États-Unis"

**Canada (non-QC) signals** (→ `"Canada"`):
- Demonyms: canadien, canadienne (without a QC city context)
- Cities: Toronto, Vancouver, Calgary, Edmonton, Ottawa, Winnipeg, Halifax, Moncton
- Provinces: Ontario, Alberta, Colombie-Britannique, Saskatchewan, Manitoba, Nouveau-Brunswick (N.-B.), Nouvelle-Écosse (N.-É.)
- Note: "habite à Montréal, au Canada" (bio says "au Canada" not "au Québec") → use `"Canada"` not `"Québec"`

**Other countries** — use the country name as written in French (e.g. `"Haïti"`, `"Jamaïque"`, `"Royaume-Uni"`, `"Australie"`, `"Suède"`, `"Colombie"`, `"Brésil"`). Look for demonyms and city/country names in context.

**Matching rules:**
- Match case-insensitively.
- A city name match is only a signal when it appears as an origin marker ("natif de X", "formé à X", "groupe de X", "X-based", etc.) — not just a tour date mention.
- When multiple signals conflict, prefer the most specific (city over country demonym).
- When uncertain, leave unresolved rather than guess.

## 3. MusicBrainz lookup (for unresolved artists)

Use the MusicBrainz API for artists whose bio yielded no signal. No API key needed. Respect the rate limit: 1 request/second maximum.

**Search endpoint:**
```
GET https://musicbrainz.org/ws/2/artist/?query=artist:"{name}"&fmt=json
User-Agent: spectaculaire/1.0 (contact@example.com)
```

Always quote the artist name as a phrase (e.g. `artist:"Zachary Richard"`, not `artist:Zachary Richard`) to get exact phrase matching via Lucene syntax. Do NOT append genre terms like "cajun" or "rap" as free text — they change query semantics unpredictably. If disambiguation is needed, use structured fields: `artist:"Name" type:group` or `artist:"Name" country:CA`.

**Field to use:** `releases[0].country` is unreliable — use the top result's `area.name` or `begin-area.name` instead. These represent where the artist or band formed/is from. Note that MusicBrainz **tags** like "Quebec" reflect cultural association, not origin — always use `area`/`begin-area`.

**Reliability check:** Only use MusicBrainz result if the top hit's `score` ≥ 85 and the name matches closely (case-insensitive, ignoring punctuation). For bands with generic names, verify the genre tags match roughly. If the top result's name does not match (e.g. searching "Zachary Richard" without quotes returns "Richard Wagner" at score 100), scan further in the list for an actual name match.

**Country name mapping** — MusicBrainz returns English country/area names; map to French:
- "Canada" → check if `begin-area.name` is a Quebec city/region → `"Québec"`, else `"Canada"`
- "United States" → `"États-Unis"`
- "France" → `"France"`
- "Belgium" → `"Belgique"`
- "United Kingdom" → `"Royaume-Uni"`
- "Australia" → `"Australie"`
- "Sweden" → `"Suède"`
- "Germany" → `"Allemagne"`
- "Netherlands" → `"Pays-Bas"`
- "Haiti" → `"Haïti"`
- Use French country name for any others.

## 4. Bandcamp (last resort for still-unresolved artists)

Bandcamp profiles often list a city/region for emerging artists. If an artist is still unresolved after MusicBrainz, try searching "{artist name} bandcamp" — either via a web search or by checking a Bandcamp link already present in their `links` array. The profile page typically shows location near the artist name.

## 5. Write field-overrides.json

Merge resolved countries into `field-overrides.json`. Preserve any existing entries (other fields like `paid` are untouched). Format:

```json
{
  "Artist Name": { "country": "Québec" },
  "Another Artist": { "country": "États-Unis" }
}
```

Keys are matched case-insensitively at runtime.

## 6. Update festivals.json

If `filter-quebec` is not already in the festival's `features` array in `src/content/festivals.json`, add it.

## 7. Report

Print a summary:
- How many resolved via bio extraction
- How many resolved via MusicBrainz
- How many resolved via Bandcamp
- List of unresolved artists (no signal found) — these need manual entries in field-overrides.json

## 8. Improve this skill

After running, update this SKILL.md if you found:
- **New bio signal patterns** that worked reliably — add them to the relevant section above.
- **New country demonyms** in French — add to the relevant section.
- **MusicBrainz quirks** — e.g. artist types (person vs group) that affect which field to use.
- **False positives** you had to correct — note the pattern to avoid.

### MusicBrainz quirks discovered

- **Very local/emerging artists** often have no MusicBrainz entry at all — if search returns `count: 0`, leave unresolved.
- **Generic name collisions**: searching "Zachary Richard" returns "Richard Wagner" (score 100) — always scan further if top result name doesn't match. Filter by actual name match before trusting the score.
- **Score threshold**: 83+ is sufficient for well-known artists with distinctive names (e.g. OMI). For score 85-89 with name match, accept.
- **area vs begin-area**: `area` reflects current location, `begin-area` is birthplace/formation place — prefer `begin-area` for origin.

### False positives to avoid

- "originaire de Moncton" → New Brunswick (Canada), NOT Québec, even if the artist is now "installée au Québec"
- "habite à Montréal, au Canada" — bio uses "au Canada" not "au Québec": mark `"Canada"` not `"Québec"`
- Tour date mentions (e.g. "spectacle à Paris", "shows in New York") are NOT origin signals
- "à travers le Québec" alone is weak — use only as supporting signal when combined with other QC indicators
