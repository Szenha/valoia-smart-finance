-- Adds 'cash' as its own payment_method value. Voice/manual entries that say
-- "paguei em dinheiro" were previously collapsing into 'debit' (the only
-- other value that maps to a checking account) — see resolvePaymentMethod in
-- src/lib/finance/account-match.ts. Additive only: existing rows keep
-- whatever value they already have, nothing is backfilled or reinterpreted.
--
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction as a statement
-- that uses the new value, so this migration only adds the value and touches
-- nothing else.
alter type payment_method add value 'cash';
