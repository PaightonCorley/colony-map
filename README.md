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
