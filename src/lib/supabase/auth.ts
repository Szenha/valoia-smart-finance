import { supabase } from "./client";

// Returns the organization_id for the authenticated user.
// Calls the SECURITY DEFINER RPC which runs as postgres (bypasses RLS) but
// still resolves auth.uid() from the JWT — so the identity is server-verified.
// The org is normally created by the auth trigger (handle_new_user) at signup;
// the RPC also acts as a fallback creator for edge cases.
export async function getOrCreateOrganization(): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_user_organization");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Falha ao obter organização do usuário.");
  return data as string;
}
