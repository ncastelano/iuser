#!/usr/bin/env python3
"""
UM pedido do começo ao fim, em câmera lenta, para você VER o acompanhamento na faixa de cima da barra do app (3.0). SÓ NO BANCO LOCAL.

A cliente pede (como ela mesma: JWT + RLS + RPC `create_store_order`, o caminho do app), a loja aceita, prepara e deixa pronto (como a dona, `admin-teste`),
e, na ENTREGA, o motorista aceita, vai à loja, chega, sai com o pedido e entrega. A cada passo o script espera `--pausa` segundos e diz o que a faixa deve mostrar.

  python3 -u scripts/local/simular-pedido.py                      # entrega, 15 s entre os passos, cliente Ana Silva
  python3 -u scripts/local/simular-pedido.py --retirada           # retirada na loja (sem motorista)
  python3 -u scripts/local/simular-pedido.py --pausa 8 --inicio 30
  python3 -u scripts/local/simular-pedido.py --cliente cliente-012@staging.iuser.test --recusa     # a loja recusa (o pedido some da faixa em vermelho no aviso)

Para assistir: `node scripts/local/set-dev-password.mjs ana-silva-1` e abra
  http://localhost:3100/dev-login?as=profile-ana-silva-1&to=/
(modo Pessoa; a faixa aparece acima da barra de baixo em qualquer página que tenha a barra). `--inicio` dá tempo de abrir antes de o pedido sair.

O motorista aqui é ENCENADO: o script grava a etapa da entrega direto (aceitou → indo à loja → na loja → a caminho → entregue). Para o motorista de verdade
(GPS andando, código de retirada, prova de entrega) use `drive-driver.py` / `simulate-pizzaria.py`.
Pare com Ctrl-C.
"""
import argparse, json, os, random, signal, sys, time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import psql, q_local  # noqa: E402

SLUG = 'pizzaria-forno-de-ouro'
R = random.Random()
STOP = False


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


def as_user(uid, sql):
    claims = json.dumps({'sub': uid, 'role': 'authenticated'})
    script = f"begin;\nselect set_config('request.jwt.claim.sub', {esc(uid)}, true), set_config('request.jwt.claims', {esc(claims)}, true);\nset local role authenticated;\n{sql}\ncommit;\n"
    return psql(['-At'], stdin=script)


def last_line(out):
    lines = [l for l in out.strip().splitlines() if l.strip() and l.strip() not in ('BEGIN', 'COMMIT', 'SET')]
    return lines[-1] if lines else ''


def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def wait(sec, why=''):
    """Espera `sec` segundos mostrando uma contagem curta; Ctrl-C encerra."""
    end = time.time() + sec
    while time.time() < end:
        if STOP:
            sys.exit(0)
        time.sleep(min(1, max(0.05, end - time.time())))


def main():
    global STOP
    ap = argparse.ArgumentParser()
    ap.add_argument('--cliente', default='ana-silva-1', help='o @ do perfil da cliente de teste (ou o e-mail dela); Ana Silva é uma conta reservada para você mexer na mão')
    ap.add_argument('--retirada', action='store_true', help='retirada na loja (sem motorista)')
    ap.add_argument('--recusa', action='store_true', help='a loja recusa o pedido')
    ap.add_argument('--pausa', type=float, default=15, help='segundos entre os passos (padrão 15)')
    ap.add_argument('--inicio', type=float, default=10, help='segundos antes de a cliente pedir, para você abrir o app (padrão 10)')
    a = ap.parse_args()
    signal.signal(signal.SIGINT, lambda *_: globals().__setitem__('STOP', True))

    s = q_local(f"select id, name, owner_id from stores where \"storeSlug\" = {esc(SLUG)}")
    if not s:
        sys.exit('Loja não encontrada: rode antes  node scripts/local/seed-pizzaria.mjs')
    store = s[0]
    c = q_local(f"select p.id, p.name, p.\"profileSlug\" as slug from profiles p join auth.users u on u.id = p.id where u.email = {esc(a.cliente)} or p.\"profileSlug\" = {esc(a.cliente)} limit 1")
    if not c:
        sys.exit(f'Cliente "{a.cliente}" não encontrada (use cliente-NNN ou o @ do perfil).')
    cli = c[0]
    goods = q_local(f"select id, name, category, price from products where store_id = {esc(store['id'])}::uuid and is_active and type = 'physical' and not coalesce(has_addons, false)")
    pizzas = [g for g in goods if 'Pizza' in (g['category'] or '')] or goods
    drinks = [g for g in goods if 'bebida' in (g['category'] or '').lower()] or goods
    if not pizzas:
        sys.exit('A loja não tem produto físico ativo sem adicionais.')
    picks = [R.choice(pizzas), R.choice(drinks)]
    items = [{'product_id': p['id'], 'quantity': 1, 'comment': None, 'addons': []} for p in picks]
    deliver = not a.retirada
    pausa = max(1.0, a.pausa)

    log(f"🎬 Pedido de {cli['name']} na {store['name']} ({'entrega' if deliver else 'retirada'}). Abra o app como ela:")
    log(f"   node scripts/local/set-dev-password.mjs {cli['slug']}")
    log(f"   http://localhost:3100/dev-login?as=profile-{cli['slug']}&to=/")
    log(f"   O pedido sai em {a.inicio:g} s; depois um passo a cada {pausa:g} s.")
    wait(a.inicio)

    # 1) a cliente pede
    addr = 'Rua das Palmeiras, 1200, Porto Velho - RO'
    sql = (f"select create_store_order({esc(store['id'])}::uuid, {esc(json.dumps(items))}::jsonb, {esc('entrega' if deliver else 'retirada')}, 'pix', "
           f"{esc(addr) if deliver else 'null'}, {-8.7612 if deliver else 'null'}, {-63.9008 if deliver else 'null'}, null, null, null, gen_random_uuid());")
    d = json.loads(last_line(as_user(cli['id'], sql)))
    order_id = d.get('order_id') or d.get('id')
    if not order_id:   # a função devolve o pedido ou o checkout: acha o mais novo dela
        order_id = q_local(f"select id from orders where buyer_id = {esc(cli['id'])}::uuid order by created_at desc limit 1")[0]['id']
    total = float(d.get('total_amount', 0))
    log(f"🛒 1/ {cli['name']} fez o pedido ({' + '.join(p['name'] for p in picks)} — R$ {total:.2f})".replace('.', ','))
    log("   👀 FAIXA: pílula VERDE  «Forno de Ouro · Aguardando a loja»")
    wait(pausa)

    def owner_set(status):
        as_user(store['owner_id'], f"update orders set status = {esc(status)} where id = {esc(order_id)}::uuid;")

    if a.recusa:
        owner_set('rejected')
        log("🏪 2/ a loja RECUSOU o pedido")
        log("   👀 FAIXA: a pílula some (o aviso de recusa aparece na ilha/aviso e em Atividade → Pedidos)")
        return

    # 2) a loja aceita e prepara
    owner_set('preparing')
    log("🏪 2/ a loja ACEITOU e começou a preparar")
    log("   👀 FAIXA: pílula AMARELA  «Forno de Ouro · Preparando»  (barrinha em 2 de 4)")
    wait(pausa)

    # 3) pronto
    owner_set('ready')
    if not deliver:
        log("🏪 3/ a loja deixou PRONTO para retirar")
        log("   👀 FAIXA: pílula ROXA  «Forno de Ouro · Pronto para retirar»")
        wait(pausa)
        psql([], stdin=f"update orders set status = 'paid' where id = {esc(order_id)}::uuid;")
        log("🙋 4/ a cliente retirou e a loja finalizou o pedido")
        log("   👀 FAIXA: a pílula SOME (pedido finalizado); a avaliação da compra aparece em Atividade → Pedidos")
        return
    log("🏪 3/ a loja deixou PRONTO — agora procura motorista")
    log("   👀 FAIXA: pílula ROXA  «Forno de Ouro · Pronto · buscando motorista»")
    wait(pausa)

    # 4) o motorista (encenado: grava a etapa da entrega direto)
    disp = q_local(f"select id, ride_request_id from order_delivery_dispatches where order_id = {esc(order_id)}::uuid limit 1")
    if not disp:
        log("   (a loja não usa Entregador iUser: não há entrega para encenar — o pedido fica «Pronto». Rode seed-entregadores.mjs.)")
        return
    did = disp[0]['id']

    def stage(st, status='accepted'):
        psql([], stdin=f"update order_delivery_dispatches set status = {esc(status)}, stage = {esc(st)} where id = {esc(did)}::uuid;")

    stage('to_store')
    log("🛵 4/ um motorista ACEITOU e está indo à loja")
    log("   👀 FAIXA: ROXA  «Forno de Ouro · Motorista indo buscar»")
    wait(pausa)
    stage('at_store')
    log("🛵 5/ o motorista CHEGOU na loja")
    log("   👀 FAIXA: ROXA  «Forno de Ouro · Motorista na loja»")
    wait(pausa)
    stage('in_transit')
    log("🛵 6/ o motorista SAIU com o pedido")
    log("   👀 FAIXA: ROXA  «Forno de Ouro · A caminho de você»  (barrinha cheia)")
    wait(pausa)
    stage('delivered', 'completed')
    psql([], stdin=f"update orders set status = 'paid' where id = {esc(order_id)}::uuid;")
    log("📦 7/ ENTREGUE e finalizado")
    log("   👀 FAIXA: a pílula SOME. O pedido fica em Atividade → Pedidos (finalizado, azul) esperando a avaliação.")


if __name__ == '__main__':
    main()
