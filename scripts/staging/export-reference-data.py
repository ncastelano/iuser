#!/usr/bin/env python3
# Copia da PRODUÇÃO (só leitura) os dados de CONFIGURAÇÃO que o app precisa para funcionar — tarifas, planos, níveis,
# regras de pontos, fases da entrega... — para supabase/staging/reference-data.sql. NENHUM dado de pessoa entra aqui.
# Valores que não podem ir para o teste são trocados (URL de webhook, chave Pix). Rode de novo para re-sincronizar.
#   python3 scripts/staging/export-reference-data.py
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, q_prod

# ordem respeita as chaves estrangeiras
TABLES = ['user_statuses', 'permissions', 'status_permissions', 'network_levels', 'avatar_borders', 'plans',
          'delivery_phases', 'delivery_phase_transitions', 'delivery_dispatch_settings', 'feature_flags',
          'free_trial_settings', 'network_settings', 'platform_tariffs', 'point_rules', 'service_pricing',
          'store_access_settings']
OVERRIDES = {
    'delivery_dispatch_settings': {'notify_url': ''},                       # aponta para a produção: fica vazio
    'store_access_settings': {'pix_key': '00000000000', 'pix_key_type': 'cpf', 'pix_receiver_name': 'STAGING (fictício)'},
    'network_settings': {'updated_by': None},
}
out = ['-- DADOS DE CONFIGURAÇÃO copiados da produção (sem dados pessoais). GERADO por scripts/staging/export-reference-data.py.\n-- Rodar numa tabela vazia (staging recém-criado ou --reset): não usa ON CONFLICT porque há unicidades adiáveis.\n']
for t in TABLES:
    cols = [r['column_name'] for r in q_prod(
        f"select column_name from information_schema.columns where table_schema='public' and table_name='{t}' and is_generated='NEVER' order by ordinal_position")]
    rows = q_prod(f'select coalesce(jsonb_agg(to_jsonb(x)), \'[]\'::jsonb) j from public."{t}" x')[0]['j']
    rows = json.loads(rows) if isinstance(rows, str) else rows
    for row in rows:
        for k, v in OVERRIDES.get(t, {}).items():
            if k in row:
                row[k] = v
    collist = ', '.join('"' + c + '"' for c in cols)
    payload = json.dumps(rows, ensure_ascii=False)
    assert '$ref$' not in payload
    out.append(f'-- {t}: {len(rows)} linha(s)\nINSERT INTO public."{t}" ({collist}) SELECT {collist} FROM jsonb_populate_recordset(null::public."{t}", $ref${payload}$ref$::jsonb);\n')
    print(f'{t}: {len(rows)}')
path = os.path.join(ROOT, 'supabase', 'staging', 'reference-data.sql')
open(path, 'w').write('\n'.join(out))
print('->', os.path.relpath(path, ROOT))
