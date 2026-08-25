import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/finance/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Ticlio — Termos de Uso" }] }),
  component: TermsRoute,
});

function TermsRoute() {
  return (
    <LegalPage title="Termos de Uso" updatedAt="25/08/2026">
      <LegalSection title="1. Natureza do beta">
        <p>
          O Ticlio está em beta fechado. Recursos, telas, preços e limites podem mudar durante essa
          fase. O acesso pode ser liberado em etapas para preservar estabilidade, suporte e
          segurança dos dados.
        </p>
      </LegalSection>
      <LegalSection title="2. Uso permitido">
        <p>
          O app é destinado à organização financeira pessoal e familiar: registrar receitas,
          despesas, categorias, metas e acompanhar resumos. O usuário é responsável pelas
          informações inseridas e por conferir os lançamentos antes de salvar.
        </p>
      </LegalSection>
      <LegalSection title="3. Sem consultoria financeira">
        <p>
          O Ticlio não presta consultoria financeira, recomendação de investimento, crédito,
          contabilidade ou orientação jurídica. Relatórios e insights são apenas ferramentas de
          organização e acompanhamento.
        </p>
      </LegalSection>
      <LegalSection title="4. Recursos de IA">
        <p>
          Recursos como voz, interpretação de texto, extração e categorização podem usar provedores
          externos de IA. A IA pode errar; revise valores, datas, contas e categorias antes de
          confirmar qualquer lançamento.
        </p>
      </LegalSection>
      <LegalSection title="5. Planos e pagamentos">
        <p>
          O trial inicial pode ter limites de uso individual. Recursos familiares, membros e
          workspaces adicionais podem ficar restritos ao plano Família. Pagamentos por Pix anual
          serão confirmados manualmente nesta fase.
        </p>
      </LegalSection>
      <LegalSection title="6. Revisão jurídica">
        <p>
          Estes termos são uma versão operacional para beta fechado e devem passar por revisão
          jurídica antes de venda em escala ou abertura pública ampla.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
