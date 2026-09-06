/**
 * Resolve a conta/cartão que o usuário confirmou explicitamente antes de uma
 * importação (OFX ou PDF).
 *
 * Retorna `null` quando nada foi selecionado ou quando o id selecionado não
 * corresponde a nenhuma conta conhecida. Nunca escolhe uma conta padrão — a
 * seleção é obrigatória e sempre explícita, para que `line_hash`, projeções de
 * parcelas e persistência usem a conta correta.
 */
export function resolveConfirmedImportAccount<T extends { id: string }>(
  accounts: readonly T[],
  selectedAccountId: string | null | undefined,
): T | null {
  if (!selectedAccountId) return null;
  return accounts.find((account) => account.id === selectedAccountId) ?? null;
}
