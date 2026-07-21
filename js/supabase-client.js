import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { CONFIG } from './config.js';

if (
    CONFIG.SUPABASE_URL.includes('PEGA_AQUI') ||
    CONFIG.SUPABASE_ANON_KEY.includes('PEGA_AQUI')
) {
    console.warn(
        'Configura SUPABASE_URL y SUPABASE_ANON_KEY en js/config.js'
    );
}

export const supabase = createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'alter-ego-admin-session'
        }
    }
);
