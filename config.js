/* =====================================================================
   Colony Map — configuration
   =====================================================================

   TO GO LIVE, fill in the two values below from your Supabase project:

     Project Settings -> API Keys -> "Publishable key"
         (this is the new name for what used to be called the anon key)
         -> SUPABASE_ANON_KEY

     Project Settings -> Data API, or the green "Connect" button
         -> SUPABASE_URL

   Both are safe to keep in this file. They are meant to be public, and
   the database rules decide what anyone holding them is allowed to do.

   NEVER put the SECRET key (sb_secret_...) or the database password in
   here. The secret key bypasses every safety rule in the database.

   While these are blank the app runs in PREVIEW mode: it reads the
   imported spreadsheet from data/preview.json and nothing is saved.
   ===================================================================== */

window.CONFIG = {
  // Base project URL only — no /rest/v1/ on the end; the client adds that.
  SUPABASE_URL: 'https://sewcumodtcjtalpwwhud.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_7AhrA57DnDXYfIabhLELcQ_dfc9y3We',

  // Map opens here — between Burnet and Llano, showing both counties
  MAP: {
    center: [30.72, -98.42],
    zoom: 10,
    minZoom: 8,
    maxZoom: 19,
    // keeps the map over the service area instead of drifting to the ocean
    bounds: [[30.00, -99.60], [31.80, -97.40]]
  },

  // How close is "probably the same colony?" — metres
  DUPLICATE_RADIUS_M: 150,

  // A colony with no visit in this many days counts as gone quiet
  STALE_DAYS: 90,

  ORGS: [
    'HCHS MASH',
    'Hill Country Cats',
    'HCHS',
    'Forgotten Felines',
    'Fat Manx Rescue',
    'Llano Kitty Fixers'
  ],

  CITIES: [
    'Burnet', 'Bertram', 'Granite Shoals', 'Marble Falls', 'Cottonwood Shores',
    'Kingsland', 'Llano', 'Horseshoe Bay', 'Lake Buchanan', 'Tow',
    'Lampasas', 'Round Mountain', 'Spicewood'
  ],

  COUNTIES: ['Burnet', 'Llano', 'Lampasas', 'Blanco']
};
