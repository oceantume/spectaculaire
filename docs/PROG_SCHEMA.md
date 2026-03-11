# programmation.json Schema

The data is fetched from `https://www.feq.ca/fr/programmation` using `scripts/fetch-programmation.js`, which extracts the SvelteKit hydration payload embedded in the page HTML.

The top-level JSON is an array of 3 entries. Schedule data lives entirely in `[1].data.mamData`.

## Entry point

```js
const raw = JSON.parse(fs.readFileSync("assets/programmation.json"));
const { ci, ve, sw } = raw[1].data.mamData;
```

- **`ci`** — CDN base URL for images, e.g. `"https://cdn.festigest.com/27/"`. Append any image filename to get the full URL.
- **`ve`** — Array of 6 venue objects.
- **`sw`** — Array of ~170 show objects.

---

## Venues (`ve`)

```json
{
  "id": 239,
  "or": 1,
  "te": "Scène Bell",
  "ln": "Plaines d'Abraham",
  "pe": "Passe obligatoire",
  "tt": true,
  "ep": false,
  "ig": "cfc8ed15-767e-4cb6-b6cb-2f0a60a41bfc.png",
  "ad": "Spectacle en admission générale debout"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique venue ID, used as foreign key in shows (`sw[].ve`) |
| `or` | number | Display order (1–6) |
| `te` | string | Venue/stage name, e.g. `"Scène Bell"` |
| `ln` | string | Physical location name, e.g. `"Plaines d'Abraham"` |
| `pe` | string | Entry requirement: `"Passe obligatoire"`, `"Gratuit"`, or `"Passe obligatoire – 18 ans et plus"` |
| `tt` | boolean | `true` = requires a paid pass |
| `ep` | boolean | Unknown, always `false` |
| `ig` | string | Venue image filename — prepend `ci` to get full URL |
| `ad` | string | General admission description |

### All 6 venues

| id | Stage | Location | Paid |
|----|-------|----------|------|
| 239 | Scène Bell | Plaines d'Abraham | Yes |
| 240 | Scène Loto-Québec | Place George-V | Yes |
| 241 | Scène SiriusXM | Place George-V | Yes |
| 242 | Scène Hydro-Québec | Place de l'Assemblée-Nationale | No |
| 243 | Scène Crave | Place D'Youville | No |
| 244 | Scène Extras FEQ | Manège militaire | Yes (18+) |

Note: Scène Loto-Québec and Scène SiriusXM share the same physical location (Place George-V) and alternate — same spot, left or right stage.

---

## Shows (`sw`)

```json
{
  "id": 4642,
  "ve": 243,
  "ta": false,
  "st": "2026-07-17T22:00:00.000Z",
  "ed": "2026-07-17T22:45:00.000Z",
  "pg": "Gratuit",
  "an": "Spectacle en admission générale debout",
  "at": { ... },
  "sa": [4646, 4644],
  "mu": "alice",
  "mt": "ALICE au Festival d'été de Québec le 17 juillet 2026",
  "md": "ALICE en spectacle au FEQ le 17 juillet 2026 à Québec. Scène Découverte à place d'Youville.",
  "ep": false,
  "so": [],
  "ts": []
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique show ID |
| `ve` | number | Venue ID — join with `ve[].id` |
| `ta` | boolean | TBA (to be announced) flag |
| `st` | string | Start time, ISO 8601 **UTC** — convert to EDT (UTC−4) for display |
| `ed` | string | End time, ISO 8601 **UTC** |
| `pg` | string | Pass/entry requirement text (same values as `ve[].pe`) |
| `an` | string | Admission note |
| `at` | object | Artist — see below |
| `sa` | number[] | IDs of other shows by the same artist (other days) |
| `mu` | string | URL slug for the artist page |
| `mt` | string | SEO meta title |
| `md` | string | SEO meta description |
| `ep` | boolean | Unknown, always `false` |
| `so` | array | Always empty in current data |
| `ts` | array | Always empty in current data |

### Time zone note

All times are UTC. The festival takes place in Québec City (EDT = UTC−4 in July). Late-night shows cross midnight local time and will have a UTC date one day ahead:

```
"st": "2026-07-10T03:30:00.000Z"  →  July 9, 2026 at 11:30 PM EDT
```

---

## Artist (`sw[].at`)

```json
{
  "id": 2359,
  "te": "ALICE",
  "cy": "Québec",
  "sc": { "id": 25, "name": "Rock", "tc": "#000000", "bc": "#c40605", "oc": "#a40605" },
  "sp": { "id": 25, "name": "Rock", "tc": "#000000", "bc": "#c40605", "oc": "#a40605" },
  "ds": "<p>HTML biography...</p>",
  "dl": "d679482e-a7c5-482d-a7f2-ef450b697ca8.jpg",
  "lt": "c0be793c-477f-44cf-b477-42b7edd2cc3d.jpg",
  "tb": "03880934-ca56-42a0-bf63-5f6bb37c706d.jpg",
  "ae": "1834732432",
  "ls": [{ "label": "Instagram", "url": "https://..." }]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique artist ID |
| `te` | string | Artist name |
| `cy` | string | Country/region of origin |
| `sc` | object | Primary genre tag with theme colors (see below) |
| `sp` | object | Secondary genre tag (often same as `sc`) |
| `ds` | string | Biography HTML |
| `dl` | string | Desktop/landscape image filename — prepend `ci` |
| `lt` | string | Large/wide image filename — prepend `ci` |
| `tb` | string | Thumbnail image filename — prepend `ci` |
| `ae` | string | External ID (likely Apple Music or Spotify) |
| `ls` | array | Social/website links: `[{ label, url }]` |

### Genre tag object (`sc` / `sp`)

| Field | Description |
|-------|-------------|
| `id` | Genre ID |
| `name` | Genre name, e.g. `"Rock"`, `"Électro"` |
| `tc` | Text color (hex) |
| `bc` | Background color (hex) |
| `oc` | Outline/hover color (hex) |

---

## Constructing image URLs

```js
const imageUrl = (ci, filename) => ci + filename;

// Example
imageUrl(ci, show.at.tb)  // thumbnail
imageUrl(ci, show.at.dl)  // desktop image
imageUrl(ci, venue.ig)    // venue image
```

---

## Useful joins for building the schedule

```js
// Index venues by id for fast lookup
const venueById = Object.fromEntries(ve.map(v => [v.id, v]));

// All shows for a given date (local EDT, UTC-4)
const showsOnDate = (dateStr) =>
  sw.filter(show => {
    const local = new Date(new Date(show.st).getTime() - 4 * 60 * 60 * 1000);
    return local.toISOString().startsWith(dateStr);
  });

// Free shows only
const freeShows = sw.filter(s => !venueById[s.ve].tt);
```
