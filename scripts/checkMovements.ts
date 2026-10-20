import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import path from 'path';

// Load env: las credenciales viven en el servidor (mismo orden que server.ts)
function readEnvLocal(): Record<string, string> {
  const result: Record<string, string> = {};
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return result;
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    result[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return result;
}

const envFile = readEnvLocal();
const SUPABASE_URL = process.env.SUPABASE_URL || envFile.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || envFile.SUPABASE_ANON_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.log('Supabase not configured');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function check() {
  const { data: movements, error: movErr } = await supabase.from('bank_movements').select('*');
  const { data: accounts, error: accErr } = await supabase.from('bank_accounts').select('id, bank_name');
  
  if (movErr || accErr) {
    console.log('Error:', movErr || accErr);
    return;
  }

  const validIds = new Set(accounts.map((a: any) => a.id));
  const orphans = movements.filter((m: any) => !validIds.has(m.bank_account_id));
  
  console.log('Total movements:', movements.length);
  console.log('Total accounts:', accounts.length);
  console.log('Orphan movements:', orphans.length);
  orphans.forEach((o: any) => console.log(`Orphan ID: ${o.id}, Account ID: ${o.bank_account_id}, Concept: ${o.concept}`));
}

check();
