#!/usr/bin/env python3
# Liga os avisos do banco de STAGING ao app de teste (push de pedido + fila de entrega). Só escreve no staging.
# Lê de .env.staging.local (não versionado):
#   STAGING_APP_URL=https://iuser-git-staging-...vercel.app      (endereço fixo da branch staging)
#   STAGING_BYPASS_SECRET=...     (Vercel → Deployment Protection → Protection Bypass for Automation; vai como ?x-vercel-protection-bypass=)
#   STAGING_WEBHOOK_SECRET=...    (o MESMO valor da variável SUPABASE_WEBHOOK_SECRET de Preview na Vercel)
import os, sys, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import ROOT, q_staging, staging_ref

env = {}
f = os.path.join(ROOT, '.env.staging.local')
for l in open(f).read().splitlines():
    if '=' in l and not l.startswith('#'):
        k, v = l.split('=', 1); env[k.strip()] = v.strip().strip('"')
app, bypass, secret = (env.get(k, '') for k in ('STAGING_APP_URL', 'STAGING_BYPASS_SECRET', 'STAGING_WEBHOOK_SECRET'))
if not (app.startswith('https://') and bypass and secret):
    sys.exit('Faltam STAGING_APP_URL (https://...), STAGING_BYPASS_SECRET e STAGING_WEBHOOK_SECRET em .env.staging.local')
if not re.fullmatch(r'[A-Za-z0-9_-]+', bypass + secret):
    sys.exit('Os segredos só podem ter letras, números, - e _ (para não quebrar o SQL).')
app = app.rstrip('/')
print('Alvo (STAGING):', staging_ref())
q_staging(f"update public.delivery_dispatch_settings set notify_url = '{app}/api/internal/delivery-events?x-vercel-protection-bypass={bypass}'")
q_staging(
    "drop trigger if exists order_push_notificatio on public.orders; "
    "create trigger order_push_notificatio after insert on public.orders for each row execute function "
    f"supabase_functions.http_request('{app}/api/push/send-order-notification?x-vercel-protection-bypass={bypass}', 'POST', "
    f"'{{\"Content-type\":\"application/json\",\"x-webhook-secret\":\"{secret}\"}}', '{{}}', '5000')")
print('OK: fila de entrega e push de pedidos apontam para', app)
