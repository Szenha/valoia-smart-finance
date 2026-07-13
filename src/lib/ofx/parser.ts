// Parser OFX defensivo. Lida com:
//  - OFX 1.x (SGML, com header "OFXHEADER:100" e tags possivelmente sem fechamento)
//  - OFX 2.x (XML bem formado, com prólogo <?xml ?><?OFX ?>)
//  - Encodings declarados no header (CHARSET=1252, UTF-8, etc.)
//  - Quebras de linha CRLF/LF/CR e espaços/indent variáveis
//  - Datas YYYYMMDD, YYYYMMDDHHMMSS, com fração ".XXX" e fuso "[+/-N:TZ]"
//  - Valores com vírgula ou ponto como separador decimal
//  - Múltiplos extratos (STMTRS / CCSTMTRS / INVSTMTRS) no mesmo arquivo

import {
  OfxAccount,
  OfxAccountKind,
  OfxDocument,
  OfxParseError,
  OfxStatement,
  OfxTransaction,
} from "./types";

// ---------- Entrada ----------

export type OfxInput = string | ArrayBuffer | Uint8Array;

export function parseOfx(input: OfxInput): OfxDocument {
  const raw = toDecodedString(input);
  const { headers, body } = splitHeaderAndBody(raw);
  const isXml = isXmlOfx(headers, body);
  const root = isXml ? parseXmlBody(body) : parseSgmlBody(body);
  return buildDocument(root);
}

// ---------- Decodificação ----------

function toDecodedString(input: OfxInput): string {
  if (typeof input === "string") return input;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  // Lê os primeiros bytes como ASCII para descobrir o charset declarado.
  const probe = new TextDecoder("ascii", { fatal: false }).decode(
    bytes.subarray(0, Math.min(bytes.length, 2048)),
  );
  const charset = detectCharset(probe);

  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    // Fallback final: tenta utf-8, depois latin1.
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      return new TextDecoder("latin1", { fatal: false }).decode(bytes);
    }
  }
}

function detectCharset(probe: string): string {
  // OFX 2.x XML: <?xml version="1.0" encoding="..." ?>
  const xmlEnc = /<\?xml[^?>]*encoding\s*=\s*["']([^"']+)["']/i.exec(probe);
  if (xmlEnc) return normalizeCharset(xmlEnc[1]);

  // OFX 1.x SGML: CHARSET:1252 / ENCODING:USASCII
  const charset = /CHARSET\s*:\s*([\w-]+)/i.exec(probe);
  if (charset) return normalizeCharset(charset[1]);
  const encoding = /ENCODING\s*:\s*([\w-]+)/i.exec(probe);
  if (encoding) return normalizeCharset(encoding[1]);

  return "utf-8";
}

function normalizeCharset(value: string): string {
  const v = value.trim().toLowerCase();
  // Apelidos comuns vistos em OFX brasileiros.
  if (v === "1252" || v === "cp1252") return "windows-1252";
  if (v === "8859-1" || v === "iso8859-1") return "iso-8859-1";
  if (v === "usascii" || v === "us-ascii") return "ascii";
  if (v === "unicode") return "utf-8";
  return v;
}

// ---------- Header vs body ----------

function splitHeaderAndBody(raw: string): { headers: string; body: string } {
  // Remove BOM eventual.
  const text = raw.replace(/^\uFEFF/, "");

  // Header SGML termina em uma linha em branco antes do primeiro "<OFX>".
  const ofxIdx = text.search(/<OFX\b/i);
  if (ofxIdx === -1) {
    throw new OfxParseError("Arquivo não contém o elemento raiz <OFX>.");
  }
  return { headers: text.slice(0, ofxIdx), body: text.slice(ofxIdx) };
}

function isXmlOfx(headers: string, body: string): boolean {
  if (/<\?xml\b/i.test(headers) || /<\?xml\b/i.test(body)) return true;
  if (/OFXHEADER\s*=\s*["']?200/i.test(headers)) return true;
  // Heurística: SGML costuma ter tags-folha sem fechamento, XML é balanceado.
  // Se vemos </OFX> e </BANKTRANLIST>, é provavelmente XML — mas isso também
  // ocorre em SGML, então só usamos heurística de header.
  return false;
}

// ---------- Árvore intermediária ----------

interface OfxNode {
  tag: string;
  // Para nós-folha: texto; para nós-pai: undefined.
  text?: string;
  children: OfxNode[];
}

function makeNode(tag: string): OfxNode {
  return { tag: tag.toUpperCase(), children: [] };
}

// ---------- Parser SGML (OFX 1.x) ----------

// Estratégia: tokenizar em tags (<...>) e texto, manter pilha de pais.
// Tags-folha (sem filhos posteriores antes do próximo open/close) carregam texto.
// Em SGML do OFX, tags-folha geralmente NÃO têm fechamento explícito:
//   <TRNAMT>-12.34
//   <FITID>2024010100001
// Quando vemos uma nova tag de abertura, qualquer "folha em aberto" se fecha.

function parseSgmlBody(body: string): OfxNode {
  const tokens = tokenizeSgml(body);
  const root: OfxNode = makeNode("__ROOT__");
  const stack: OfxNode[] = [root];

  for (const tok of tokens) {
    if (tok.kind === "open") {
      // Se o topo é uma folha com texto pendente, ela já está "fechada" implicitamente.
      const parent = stack[stack.length - 1];
      const node = makeNode(tok.tag);
      parent.children.push(node);
      stack.push(node);
    } else if (tok.kind === "close") {
      // Fecha até encontrar a tag correspondente. SGML do OFX permite que
      // folhas fiquem sem </TAG>; aqui pop até bater.
      const tag = tok.tag.toUpperCase();
      let idx = stack.length - 1;
      while (idx > 0 && stack[idx].tag !== tag) idx--;
      if (idx > 0) {
        stack.length = idx; // mantém pais acima
      }
      // se não encontrou, ignora silenciosamente (arquivo malformado).
    } else {
      // text
      const top = stack[stack.length - 1];
      if (!top || top === root) continue;
      // Texto pertence ao nó-folha mais recente.
      // Se o nó já tem filhos, então não é folha — ignoramos espaços.
      if (top.children.length === 0) {
        const trimmed = decodeEntities(tok.text).trim();
        if (trimmed.length > 0) {
          top.text = (top.text ?? "") + trimmed;
          // Folha implícita: ao receber texto, retiramos da pilha para que a
          // próxima <TAG> vá para o pai correto.
          stack.pop();
        }
      }
    }
  }

  return root;
}

type SgmlToken =
  | { kind: "open"; tag: string }
  | { kind: "close"; tag: string }
  | { kind: "text"; text: string };

function tokenizeSgml(body: string): SgmlToken[] {
  const out: SgmlToken[] = [];
  const re = /<\s*(\/?)\s*([A-Za-z0-9_.]+)\s*>/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > lastIdx) {
      const text = body.slice(lastIdx, m.index);
      if (text.length > 0) out.push({ kind: "text", text });
    }
    const isClose = m[1] === "/";
    const tag = m[2];
    out.push(isClose ? { kind: "close", tag } : { kind: "open", tag });
    lastIdx = re.lastIndex;
  }
  if (lastIdx < body.length) {
    const text = body.slice(lastIdx);
    if (text.length > 0) out.push({ kind: "text", text });
  }
  return out;
}

// ---------- Parser XML (OFX 2.x) ----------
// Reaproveita o mesmo tokenizer: OFX 2.x é XML simples, sem atributos
// significativos para nós de domínio e sem CDATA em uso real. Tratamos
// <?...?> como ruído e exigimos tags balanceadas.

function parseXmlBody(body: string): OfxNode {
  // Remove processing instructions e comentários.
  const clean = body.replace(/<\?[^?]*\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  return parseSgmlBody(clean);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

// ---------- Acesso à árvore ----------

function findOfxRoot(root: OfxNode): OfxNode {
  const ofx = root.children.find((c) => c.tag === "OFX");
  if (!ofx) throw new OfxParseError("Elemento <OFX> não encontrado.");
  return ofx;
}

function child(node: OfxNode, tag: string): OfxNode | undefined {
  return node.children.find((c) => c.tag === tag);
}

function children(node: OfxNode, tag: string): OfxNode[] {
  return node.children.filter((c) => c.tag === tag);
}

function descendants(node: OfxNode, tag: string): OfxNode[] {
  const out: OfxNode[] = [];
  const stack: OfxNode[] = [node];
  while (stack.length) {
    const n = stack.pop()!;
    for (const c of n.children) {
      if (c.tag === tag) out.push(c);
      stack.push(c);
    }
  }
  return out;
}

function text(node: OfxNode | undefined, tag: string): string | undefined {
  if (!node) return undefined;
  const c = child(node, tag);
  return c?.text;
}

// ---------- Registros de saldo que o BB inclui como STMTTRN ----------
// "Saldo Anterior" / "Saldo do dia" são linhas informativas, não transações reais.
const BALANCE_LINE_PATTERN = /^\s*saldo\s+(anterior|do\s+dia|atual|final|disponível)/i;

// ---------- FITID sintético determinístico ----------
// Usado quando o banco omite o FITID (ex: Banco do Brasil).
// FNV-1a 32-bit sobre data+valor+descrição+posição → prefixo "SYNTH".
function syntheticFitId(
  postedAt: Date,
  amount: number,
  description: string,
  index: number,
): string {
  const seed = `${postedAt.toISOString()}|${amount.toFixed(2)}|${description}|${index}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `SYNTH${h.toString(16).toUpperCase().padStart(8, "0")}`;
}

// ---------- Conversões ----------

function parseAmount(raw: string | undefined): number {
  if (raw === undefined) return NaN;
  // OFX BR frequentemente usa vírgula como separador decimal.
  const cleaned = raw.trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Converte data OFX para Date em UTC.
 * Formatos suportados:
 *   YYYYMMDD
 *   YYYYMMDDHHMMSS
 *   YYYYMMDDHHMMSS.XXX
 *   YYYYMMDDHHMMSS.XXX[+/-N[:TZNAME]]
 *   YYYYMMDDHHMMSS[+/-N[:TZNAME]]
 */
function parseDate(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  const m =
    /^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?(?:\.(\d{1,3}))?(?:\[([+-]?\d+(?:\.\d+)?)(?::[^\]]*)?\])?$/.exec(
      s,
    );
  if (!m) return undefined;
  const [, y, mo, d, hh, mm, ss, frac, tz] = m;
  const ms = frac ? Number(frac.padEnd(3, "0").slice(0, 3)) : 0;
  const baseUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    hh ? Number(hh) : 0,
    mm ? Number(mm) : 0,
    ss ? Number(ss) : 0,
    ms,
  );
  // Se o arquivo declara fuso, baseUtc representa "wall time" naquele fuso;
  // convertemos subtraindo o offset (em horas).
  if (tz !== undefined) {
    const offsetHours = Number(tz);
    if (Number.isFinite(offsetHours)) {
      return new Date(baseUtc - offsetHours * 3600_000);
    }
  }
  return new Date(baseUtc);
}

// ---------- Construção do documento ----------

function buildDocument(root: OfxNode): OfxDocument {
  const ofx = findOfxRoot(root);

  const signon = child(ofx, "SIGNONMSGSRSV1");
  const sonrs = signon ? child(signon, "SONRS") : undefined;
  const fi = sonrs ? child(sonrs, "FI") : undefined;
  const institution = fi ? { org: text(fi, "ORG"), fid: text(fi, "FID") } : undefined;
  const serverDate = parseDate(text(sonrs, "DTSERVER"));

  const statements: OfxStatement[] = [];

  for (const stmt of descendants(ofx, "STMTRS")) {
    statements.push(buildBankStatement(stmt, "checking"));
  }
  for (const stmt of descendants(ofx, "CCSTMTRS")) {
    statements.push(buildBankStatement(stmt, "credit_card"));
  }
  for (const stmt of descendants(ofx, "INVSTMTRS")) {
    statements.push(buildInvStatement(stmt));
  }

  if (statements.length === 0) {
    throw new OfxParseError("Nenhum extrato encontrado (STMTRS, CCSTMTRS ou INVSTMTRS).");
  }

  return { institution, serverDate, statements };
}

function buildBankStatement(
  stmt: OfxNode,
  kind: Exclude<OfxAccountKind, "investment">,
): OfxStatement {
  const currency = text(stmt, "CURDEF") ?? "BRL";
  const acctFromTag = kind === "credit_card" ? "CCACCTFROM" : "BANKACCTFROM";
  const acctNode = child(stmt, acctFromTag);
  if (!acctNode) {
    throw new OfxParseError(`Bloco ${acctFromTag} ausente no extrato.`);
  }
  const account: OfxAccount = {
    kind,
    bankId: text(acctNode, "BANKID"),
    accountId: text(acctNode, "ACCTID") ?? "",
    accountType: text(acctNode, "ACCTTYPE"),
    currency,
  };
  if (!account.accountId) {
    throw new OfxParseError("ACCTID ausente no extrato.");
  }

  const tranList = child(stmt, "BANKTRANLIST");
  const periodStart = parseDate(text(tranList, "DTSTART"));
  const periodEnd = parseDate(text(tranList, "DTEND"));
  const fallbackDate = periodStart ?? periodEnd;

  const transactions: OfxTransaction[] = [];
  if (tranList) {
    const txNodes = children(tranList, "STMTTRN");
    for (let idx = 0; idx < txNodes.length; idx++) {
      const tx = buildTransaction(txNodes[idx], currency, idx, fallbackDate);
      // Skip informational balance rows that BB (and others) include as STMTTRN
      if (BALANCE_LINE_PATTERN.test(tx.description) || BALANCE_LINE_PATTERN.test(tx.memo ?? ""))
        continue;
      transactions.push(tx);
    }
  }

  const ledgerBal = child(stmt, "LEDGERBAL");
  const availBal = child(stmt, "AVAILBAL");

  return {
    account,
    periodStart,
    periodEnd,
    ledgerBalance: ledgerBal ? parseAmount(text(ledgerBal, "BALAMT")) : undefined,
    ledgerBalanceAt: ledgerBal ? parseDate(text(ledgerBal, "DTASOF")) : undefined,
    availableBalance: availBal ? parseAmount(text(availBal, "BALAMT")) : undefined,
    availableBalanceAt: availBal ? parseDate(text(availBal, "DTASOF")) : undefined,
    transactions,
  };
}

function buildInvStatement(stmt: OfxNode): OfxStatement {
  const currency = text(stmt, "CURDEF") ?? "BRL";
  const acctNode = child(stmt, "INVACCTFROM");
  if (!acctNode) {
    throw new OfxParseError("Bloco INVACCTFROM ausente no extrato de aplicação.");
  }
  const account: OfxAccount = {
    kind: "investment",
    bankId: text(acctNode, "BROKERID"),
    accountId: text(acctNode, "ACCTID") ?? "",
    currency,
  };
  if (!account.accountId) {
    throw new OfxParseError("ACCTID ausente no extrato de aplicação.");
  }

  const tranList = child(stmt, "INVTRANLIST");
  const periodStart = parseDate(text(tranList, "DTSTART"));
  const periodEnd = parseDate(text(tranList, "DTEND"));
  const fallbackDate = periodStart ?? periodEnd;

  // Aplicações têm várias variantes (BUYMF, SELLMF, INCOME, INVBANKTRAN...).
  // Para a Fase 1, normalizamos para transações lineares:
  //   - INVBANKTRAN encapsula um STMTTRN comum
  //   - Demais tipos: tentamos extrair INVTRAN + TOTAL como valor
  const transactions: OfxTransaction[] = [];
  if (tranList) {
    let txIdx = 0;
    for (const c of tranList.children) {
      if (c.tag === "DTSTART" || c.tag === "DTEND") continue;
      if (c.tag === "INVBANKTRAN") {
        const inner = child(c, "STMTTRN");
        if (inner) transactions.push(buildTransaction(inner, currency, txIdx, fallbackDate));
        txIdx++;
        continue;
      }
      const invTran = child(c, "INVTRAN");
      if (!invTran) continue;
      const total = parseAmount(text(c, "TOTAL"));
      const postedAt = parseDate(text(invTran, "DTTRADE")) ?? fallbackDate ?? new Date();
      const memo = text(invTran, "MEMO");
      const description = [c.tag, memo].filter(Boolean).join(" — ");
      const rawFitId = text(invTran, "FITID");
      const fitIdGenerated = !rawFitId;
      const amount = Number.isFinite(total) ? total : 0;
      const fitId = rawFitId ?? syntheticFitId(postedAt, amount, description, txIdx);
      transactions.push({
        type: c.tag,
        postedAt,
        userDate: parseDate(text(invTran, "DTSETTLE")),
        amount,
        fitId,
        ...(fitIdGenerated && { fitIdGenerated: true }),
        name: c.tag,
        memo,
        description,
        currency,
      });
      txIdx++;
    }
  }

  return {
    account,
    periodStart,
    periodEnd,
    transactions,
  };
}

function buildTransaction(
  t: OfxNode,
  fallbackCurrency: string,
  index: number,
  fallbackDate?: Date,
): OfxTransaction {
  const payee = child(t, "PAYEE");
  const name = text(t, "NAME") ?? (payee ? text(payee, "NAME") : undefined);
  const memo = text(t, "MEMO");
  const currencyNode = child(t, "CURRENCY") ?? child(t, "ORIGCURRENCY");
  const currency = (currencyNode ? text(currencyNode, "CURSYM") : undefined) ?? fallbackCurrency;

  const parsedDate = parseDate(text(t, "DTPOSTED"));
  // Treat missing dates AND clearly wrong dates (year < 1990, e.g. "1902" sentinel
  // that Banco do Brasil emits for transactions with no date) as invalid.
  const dateInvalid = !parsedDate || parsedDate.getFullYear() < 1990;
  const postedAt = dateInvalid ? fallbackDate : parsedDate;
  if (!postedAt) {
    throw new OfxParseError("DTPOSTED ausente ou inválido em STMTTRN.");
  }

  const amount = parseAmount(text(t, "TRNAMT"));
  if (!Number.isFinite(amount)) {
    throw new OfxParseError("TRNAMT ausente ou inválido em STMTTRN.");
  }
  const description = [name, memo].filter(Boolean).join(" — ");
  const rawFitId = text(t, "FITID");
  const fitIdGenerated = !rawFitId;
  const fitId = rawFitId ?? syntheticFitId(postedAt, amount, description, index);
  return {
    type: (text(t, "TRNTYPE") ?? "OTHER").toUpperCase(),
    postedAt,
    userDate: parseDate(text(t, "DTUSER")),
    amount,
    fitId,
    ...(fitIdGenerated && { fitIdGenerated: true }),
    ...(dateInvalid && fallbackDate && { dateInvalid: true }),
    checkNumber: text(t, "CHECKNUM") ?? text(t, "REFNUM"),
    name,
    memo,
    description,
    currency,
  };
}
