import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/finance/LegalPage";

export const Route = createFileRoute("/ai-notice")({
  head: () => ({ meta: [{ title: "Ticlio — Aviso sobre IA" }] }),
  component: AiNoticeRoute,
});

function AiNoticeRoute() {
  return (
    <LegalPage title="Aviso sobre uso de IA" updatedAt="25/08/2026">
      <LegalSection title="1. Onde a IA pode ser usada">
        <p>
          O Ticlio pode usar IA para transcrever áudio, interpretar lançamentos ditados ou
          digitados, sugerir categorias e extrair informações de textos ou documentos financeiros.
        </p>
      </LegalSection>
      <LegalSection title="2. Provedores externos">
        <p>
          Áudio, texto, descrições de transações, categorias e trechos de documentos podem ser
          enviados para provedores externos como OpenAI e Anthropic, conforme o recurso utilizado.
        </p>
      </LegalSection>
      <LegalSection title="3. Possibilidade de erro">
        <p>
          A IA pode interpretar valores, datas, contas, categorias e descrições de forma incorreta.
          O usuário deve revisar os campos antes de salvar ou confirmar qualquer lançamento.
        </p>
      </LegalSection>
      <LegalSection title="4. Minimização">
        <p>
          O app deve enviar apenas o conteúdo necessário para executar cada recurso. Evite ditar ou
          importar informações que não sejam necessárias para o lançamento financeiro.
        </p>
      </LegalSection>
      <LegalSection title="5. Sem decisão financeira automatizada">
        <p>
          A IA do Ticlio não toma decisões financeiras por você. Ela apenas ajuda a registrar,
          organizar e classificar informações inseridas pelo usuário.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
