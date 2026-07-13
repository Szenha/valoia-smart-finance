-- Adiciona suporte a importação de fatura PDF com extração via IA.
-- Novos campos em statement_imports e transactions.

-- Enum de origem do extrato
-- import_source já foi criado no banco com: ofx_manual, pdf_manual, open_finance
-- A linha abaixo está comentada para evitar erro de tipo duplicado ao re-executar.
-- CREATE TYPE import_source AS ENUM ('ofx_manual', 'pdf_manual', 'open_finance');

-- statement_imports: origem, totais declarado/extraído e flag de revisão
ALTER TABLE statement_imports
  ADD COLUMN source            import_source NOT NULL DEFAULT 'ofx_file',
  ADD COLUMN declared_total    numeric(15,2),  -- total digitado pelo usuário na fatura
  ADD COLUMN extracted_total   numeric(15,2),  -- soma calculada pela IA
  ADD COLUMN requires_review   boolean NOT NULL DEFAULT false;

-- transactions: confiança da extração e trecho do texto-fonte
ALTER TABLE transactions
  ADD COLUMN extraction_confidence    numeric(4,3),   -- 0.000–1.000
  ADD COLUMN extraction_source_excerpt text;           -- trecho do PDF que originou a linha
