# Community Cat Colony TNVR Map

Hill Country Humane Society — Burnet & Llano counties, Texas.

A map of known community cat colonies that volunteers can view and update
from a phone while they're out trapping.

- 🔴 **Needs TNVR** — no cats fixed yet
- 🟡 **In Progress** — some fixed, more to go
- 🟢 **Complete** — all known cats fixed

Anyone can view the map, open a colony, record a TNVR visit, correct a
count, or report a new colony. No account needed. Every change is recorded
with the editor's name and can be undone.

## What's in here

Front-end only — plain HTML, CSS and JavaScript, no build step.

```
index.html      the page
config.js       Supabase project URL and publishable key
styles.css
js/
  ui.js         sheets, toasts, steppers, formatting
  store.js      data layer (Supabase)
  map.js        Leaflet map and the coloured pins
  colony.js     the colony record
  forms.js      TNVR visit, quick update, add colony, claim
  filters.js    search and filters
  attention.js  "where should we work next"
  main.js       wiring
```

Colony data is **not** in this repository. It lives in Supabase, and the
records contain caretaker names and phone numbers that have no business
being in a public repo.

## Running it locally

Any static file server works:

```bash
python -m http.server 8123
```

Then open http://localhost:8123/

## Configuration

`config.js` holds the Supabase project URL and the **publishable** key.
Both are designed to be public — the database's row-level security rules
decide what anyone holding them may actually do. The secret key and the
database password are never in this repository and never should be.


## Completed cats view (October 2026)

The default view uses the 1,754-entry HCHS_Completed_Cats.xlsx snapshot:
1,737 dated past clinic entries through October 14 plus 17 with unclear dates.
Past entries are treated as completed, not independently verified surgery outcomes.
This count is not added to the colony database's known_fixed counts, and does not
set colony completion status. Colony work remains available in the view selector.

`data/completed-cats.json` contains only aggregate counts, dates, areas and existing
colony IDs. Eight unambiguous street-and-city matches link 34 cats to existing
colony records. Coordinates and address labels are read from the existing database
at runtime. Seven of those locations currently have coordinates (22 cats); the eighth needs
a pin (12 cats). The other 1,720 cats remain visible by area in Needs a location. No
new residential addresses, contacts, phones or source notes are published here.
If the database is unavailable, all cats remain in the total with no false pins.

This is a dated snapshot, not a live Excel connection. Replace the aggregate data
when the completed workbook changes, reconciling locations plus unlocated counts
to total. Do not count future bookings or no-shows, duplicate colony estimates,
or assume a matched clinic record means every cat at that colony is fixed.
