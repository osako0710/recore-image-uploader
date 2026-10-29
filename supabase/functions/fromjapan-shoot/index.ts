import { DEFAULT_DRAFT_MODEL, handle } from './handler.ts';

const value = (name: string) => (Deno.env.get(name) ?? '').trim();

Deno.serve((req) => handle(req, {
  supabaseUrl: value('SUPABASE_URL'),
  serviceRoleKey: value('SUPABASE_SERVICE_ROLE_KEY'),
  githubToken: value('PHYSCHECK_GH_TOKEN'),
  geminiKey: value('GEMINI_API_KEY'),
  model: value('ZZ_DRAFT_MODEL') || DEFAULT_DRAFT_MODEL,
}));
