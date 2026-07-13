-- Pipeline de classificação automática de transações.

-- Trigram similarity para busca fuzzy em classification_memory.pattern
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_classification_memory_pattern_trgm
  ON classification_memory USING GIN (pattern gin_trgm_ops);

-- Novos campos em transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS classification_method text
    CHECK (classification_method IN ('memoria_exata', 'regra_similaridade', 'ia', 'manual')),
  ADD COLUMN IF NOT EXISTS classification_confidence numeric(4,3)
    CHECK (classification_confidence BETWEEN 0 AND 1),
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

-- RPC: melhor match por similaridade trigrama para um padrão específico.
-- SECURITY INVOKER → RLS de classification_memory se aplica automaticamente.
CREATE OR REPLACE FUNCTION public.find_classification(
  p_org_id         uuid,
  p_pattern        text,
  p_min_similarity float DEFAULT 0.6
)
RETURNS TABLE(
  category_id     uuid,
  confidence      numeric,
  sim             float,
  matched_pattern text
)
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    cm.category_id,
    cm.confidence,
    similarity(cm.pattern, p_pattern)  AS sim,
    cm.pattern                          AS matched_pattern
  FROM classification_memory cm
  WHERE cm.organization_id = p_org_id
    AND similarity(cm.pattern, p_pattern) >= p_min_similarity
  ORDER BY sim DESC, cm.match_count DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.find_classification(uuid, text, float) TO authenticated;
