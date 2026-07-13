// Tipos do parser OFX (Open Financial Exchange).
// Suporta extratos de conta corrente (BANKMSGSRSV1 / STMTRS),
// cartão de crédito (CREDITCARDMSGSRSV1 / CCSTMTRS) e
// aplicações / investimentos (INVSTMTMSGSRSV1 / INVSTMTRS).

export type OfxAccountKind = "checking" | "credit_card" | "investment";

export type OfxTransactionType =
  | "CREDIT"
  | "DEBIT"
  | "INT"
  | "DIV"
  | "FEE"
  | "SRVCHG"
  | "DEP"
  | "ATM"
  | "POS"
  | "XFER"
  | "CHECK"
  | "PAYMENT"
  | "CASH"
  | "DIRECTDEP"
  | "DIRECTDEBIT"
  | "REPEATPMT"
  | "HOLD"
  | "OTHER"
  | string; // OFX permite outros valores; mantemos string aberta.

export interface OfxTransaction {
  /** TRNTYPE bruto do OFX. */
  type: OfxTransactionType;
  /** Data de postagem (DTPOSTED) normalizada para Date em UTC. */
  postedAt: Date;
  /** Data efetiva do usuário (DTUSER), quando presente. */
  userDate?: Date;
  /** Valor (TRNAMT). Negativo = débito, positivo = crédito. */
  amount: number;
  /** Identificador único da transação no extrato (FITID). */
  fitId: string;
  /** true quando FITID estava ausente no OFX e foi gerado sinteticamente. */
  fitIdGenerated?: boolean;
  /** true quando DTPOSTED estava ausente/inválida e foi substituída pela data do período do extrato. */
  dateInvalid?: boolean;
  /** Número do cheque / documento, quando houver (CHECKNUM / REFNUM). */
  checkNumber?: string;
  /** Nome do beneficiário (NAME ou PAYEE.NAME). */
  name?: string;
  /** Memo / descrição livre (MEMO). */
  memo?: string;
  /** Concatenação utilitária de name + memo para classificação. */
  description: string;
  /** Moeda da transação (CURDEF do extrato, ou CURRENCY/ORIGCURRENCY da linha). */
  currency: string;
}

export interface OfxAccount {
  kind: OfxAccountKind;
  /** BANKID quando aplicável (conta corrente). */
  bankId?: string;
  /** ACCTID — número da conta ou do cartão. */
  accountId: string;
  /** ACCTTYPE (CHECKING, SAVINGS etc.) quando presente. */
  accountType?: string;
  /** Moeda padrão do extrato (CURDEF). */
  currency: string;
}

export interface OfxStatement {
  account: OfxAccount;
  /** Período do extrato (DTSTART / DTEND). */
  periodStart?: Date;
  periodEnd?: Date;
  /** Saldo final (LEDGERBAL.BALAMT) quando informado. */
  ledgerBalance?: number;
  ledgerBalanceAt?: Date;
  /** Saldo disponível (AVAILBAL.BALAMT) quando informado. */
  availableBalance?: number;
  availableBalanceAt?: Date;
  transactions: OfxTransaction[];
}

export interface OfxDocument {
  /** Instituição financeira (FI.ORG / FI.FID), quando declarada. */
  institution?: { org?: string; fid?: string };
  /** Data de geração do arquivo (DTSERVER), quando presente. */
  serverDate?: Date;
  /** Todos os extratos contidos no arquivo. Um arquivo pode ter múltiplas contas. */
  statements: OfxStatement[];
}

export class OfxParseError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OfxParseError";
  }
}
