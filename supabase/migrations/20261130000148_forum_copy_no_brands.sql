-- 20261130000148 — tira menções a marcas de outras empresas dos textos das novidades (só DADOS; reaplicável).
-- Regra: nomes de outras empresas não aparecem no iUser, exceto ao falar de link compartilhado.
-- Rollback: não há (é só texto); o texto antigo está nas migrações 137, 140 e 142.
UPDATE public.forum_releases r SET
    summary = replace(replace(replace(coalesce(r.summary, ''), 'o que o WhatsApp tem no dia a dia', 'ações do dia a dia'), ', como no WhatsApp', ''), ' como no WhatsApp', ''),
    added = ARRAY(SELECT replace(replace(x, ', como no WhatsApp', ''), ' como no WhatsApp', '') FROM unnest(r.added) x),
    improved = ARRAY(SELECT replace(replace(x, ', como no WhatsApp', ''), ' como no WhatsApp', '') FROM unnest(r.improved) x)
WHERE r.version IN ('3.0.26', '3.0.27', '3.0.28')
  AND (r.summary ILIKE '%whatsapp%' OR EXISTS (SELECT 1 FROM unnest(r.added) x WHERE x ILIKE '%whatsapp%')
       OR EXISTS (SELECT 1 FROM unnest(r.improved) x WHERE x ILIKE '%whatsapp%'));
