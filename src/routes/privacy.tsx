import { createFileRoute } from "@tanstack/react-router";
import { LegalPage, LegalSection } from "@/components/finance/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Ticlio — Política de Privacidade" }] }),
  component: PrivacyRoute,
});

function PrivacyRoute() {
  return (
    <LegalPage title="Política de Privacidade" updatedAt="25/08/2026">
      <LegalSection title="1. Dados tratados">
        <p>
          O Ticlio pode tratar email, identificadores de usuário, dados de workspace, membros,
          contas, cartões, categorias, metas, receitas, despesas, arquivos/textos importados, áudio
          gravado para transcrição e dados técnicos necessários para operação do app.
        </p>
      </LegalSection>
      <LegalSection title="2. Finalidade">
        <p>
          Os dados são usados para autenticar o usuário, registrar e organizar informações
          financeiras, apresentar painéis, executar recursos de IA, controlar acesso ao trial/plano
          e manter segurança e suporte do beta.
        </p>
      </LegalSection>
      <LegalSection title="3. Compartilhamento com provedores">
        <p>
          Recursos de voz, interpretação de texto, extração e categorização podem enviar conteúdo a
          provedores externos de IA e infraestrutura. O app deve evitar armazenar texto sensível em
          logs sempre que possível, mas o beta ainda está em aperfeiçoamento.
        </p>
      </LegalSection>
      <LegalSection title="4. Controle do usuário">
        <p>
          Durante o beta, solicitações de exportação, correção ou exclusão de dados podem ser
          atendidas manualmente pelo responsável pelo Ticlio. Antes da abertura comercial ampla,
          esses processos devem ser formalizados e revisados juridicamente.
        </p>
      </LegalSection>
      <LegalSection title="5. Segurança">
        <p>
          O app usa autenticação, regras de acesso por workspace e Row Level Security no Supabase
          para separar dados. Ainda assim, nenhum sistema é isento de risco; por isso o beta será
          liberado de forma controlada.
        </p>
      </LegalSection>
      <LegalSection title="6. Aviso LGPD">
        <p>
          Este documento não substitui uma política revisada por advogado. Ele é uma base de
          transparência para beta fechado e deve ser revisado juridicamente antes de venda em
          escala.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
