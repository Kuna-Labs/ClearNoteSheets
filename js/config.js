// ClearNote Sheets: site settings
//
// Fill in the two Supabase values to switch the store from the demo catalog to your
// real one. Both are safe in the browser: row-level security lets visitors read only
// published sheets, and only signed-in admins can add, change or delete anything.
// (Supabase dashboard: Project Settings > API Keys. Use the publishable key, or the
// legacy "anon" key. Never put a secret / service_role key here.)

export const CONFIG = {
  supabaseUrl: '',            // e.g. 'https://abcdefghijklm.supabase.co'
  supabaseKey: '',            // e.g. 'sb_publishable_...'
  imageBucket: 'sheet-images',

  currency: 'USD',
  locale: 'en-US',

  // Shown in the footer when filled in.
  contactEmail: '',

  // Where buyers find past purchases and re-download their PDFs.
  // Payhip keeps every order under the email used at checkout.
  payhipAccountUrl: 'https://payhip.com/auth/login',

  // How long a visitor's browser reuses the catalog before asking Supabase again.
  cacheMinutes: 5,
};

export const isConfigured = () => Boolean(CONFIG.supabaseUrl && CONFIG.supabaseKey);
