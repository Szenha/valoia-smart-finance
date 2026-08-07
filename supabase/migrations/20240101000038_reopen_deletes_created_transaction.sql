-- Reabrir uma conta fixa paga tem que estornar de verdade: se a baixa criou
-- uma movimentação nova (fluxo padrão, sem vincular a um lançamento já
-- existente), reabrir precisa excluir essa movimentação — senão o valor
-- continua afetando o saldo da conta mesmo depois do "estorno". Quando a
-- baixa foi VINCULADA a um lançamento que já existia antes (import de
-- extrato, lançamento manual anterior), esse lançamento não nasceu da baixa
-- e não deve ser apagado por reabrir — só desvincula.
--
-- paid_transaction_created marca qual dos dois casos foi este pagamento.
-- Default false pra histórico existente: não temos como saber retroativamente
-- se a transação foi criada ou vinculada, e a opção segura é nunca apagar
-- sem essa informação.
alter table public.recurring_bill_occurrences
  add column if not exists paid_transaction_created boolean not null default false;
