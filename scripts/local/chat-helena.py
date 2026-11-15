#!/usr/bin/env python3
"""
Pessoas conversando NATURALMENTE com a Helena Prado (conta de teste `helena-prado`), na caixa PESSOAL dela — para ver como ficam as notificações de mensagens
(selo da barra de baixo, fichinhas do menu "Eu", lista de conversas, mensagens não lidas). SÓ NO BANCO LOCAL (staging/produção nunca).

Cada pessoa age como ela mesma (papel `authenticated` + JWT, então RLS, gatilhos e RPCs valem — o mesmo caminho do app): abre a conversa (`start_conversation`) e escreve
uma mensagem de cada vez, com pausas de quem digita, às vezes duas seguidas. Começam em horários diferentes (a notificação continua chegando enquanto roda). Se a Helena
RESPONDER pelo app, a pessoa responde de volta uns segundos depois (até 2 vezes por conversa) — dá para conversar de verdade.

  python3 -u scripts/local/chat-helena.py                 # 10 minutos, 6 pessoas
  python3 -u scripts/local/chat-helena.py --minutes 30 --people 8
  python3 -u scripts/local/chat-helena.py --once          # uma mensagem só (teste rápido)
  python3 -u scripts/local/chat-helena.py --slow 2        # tudo duas vezes mais devagar
Pare com Ctrl-C (ou `pkill -f chat-helena.py`).
"""
import argparse, json, os, random, re, signal, sys, threading, time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import psql, q_local  # noqa: E402

UUID = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
R = random.Random()
LOCK = threading.Lock()
STOP = threading.Event()
HELENA_SLUG = 'helena-prado'
# contas reservadas para testes à mão (Ana Silva e Felipe Costa) e o simulador do Teatro não entram
RESERVED = ('28e08603-96b0-49fc-867e-efc3d8e7d63b', 'e72ff0cd-7a15-4177-b615-a035d3ef569c')

# Conversas de verdade: o que cada pessoa escreve, na ordem. {n} = primeiro nome de quem escreve.
SCENARIOS = [
    ["Oi Helena, tudo bem?", "Vi seu perfil e queria entender como funciona a primeira conversa.", "Você atende online também?"],
    ["Boa tarde, Helena! Quanto custa a sessão?", "E dá pra parcelar?"],
    ["Helena, consegue me encaixar essa semana?", "Estou numa fase bem corrida no trabalho e preciso conversar com alguém 😅", "Qualquer horário depois das 18h pra mim está ótimo"],
    ["Helena, só passando pra agradecer pela conversa de ontem 💛", "Me ajudou muito mesmo", "Já indiquei você pra uma amiga"],
    ["Oi! A Ana me passou seu contato, disse que você é incrível", "Posso te mandar uns horários que eu tenho livre?"],
    ["Helena, boa noite! Desculpa o horário 🙏", "Preciso remarcar a sessão de quinta, tem como?", "Pode ser sexta de manhã?"],
    ["Oi Helena! Aqui é a {n}", "Lembra que a gente conversou semana passada sobre o grupo de acolhimento?", "Ainda tem vaga?"],
    ["Helena, tudo certo pra amanhã?", "Só pra confirmar o horário, não lembro se era 14h ou 15h"],
    ["Olá! Você atende adolescente?", "É pro meu filho, ele tem 16 anos", "Ele está meio resistente, mas aceitou conhecer"],
    ["Helena, vi sua publicação sobre ansiedade e me identifiquei muito", "Dá pra agendar uma primeira conversa?"],
]
# o que a pessoa responde quando a Helena escreve de volta
REPLIES = [
    ["Perfeito, obrigada!", "Combinado! Te vejo lá 😊", "Show, fechado então!", "Que bom! Vou confirmar aqui e te aviso", "Muito obrigada, Helena 💛", "Ótimo, anotado aqui!", "Maravilha! Obrigado pela atenção"],
    ["Pode deixar!", "Qualquer coisa eu te chamo por aqui", "Fico no aguardo então", "Até lá! 😊", "Valeu, Helena!", "Obrigado por responder tão rápido"],
]


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


def as_user(uid, sql):
    claims = json.dumps({'sub': uid, 'role': 'authenticated'})
    script = f"begin;\nselect set_config('request.jwt.claim.sub', {esc(uid)}, true), set_config('request.jwt.claims', {esc(claims)}, true);\nset local role authenticated;\n{sql}\ncommit;\n"
    return psql(['-At'], stdin=script)


def log(msg):
    with LOCK:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def nap(sec, slow):
    STOP.wait(max(0.2, sec * slow))


def send(uid, conv, text):
    as_user(uid, f"insert into direct_messages (conversation_id, sender_id, content) values ({esc(conv)}::uuid, {esc(uid)}::uuid, {esc(text)});")


def person_thread(p, helena_id, script, start_after, slow, deadline):
    first = p['name'].split()[0]
    nap(start_after, slow)
    if STOP.is_set() or time.time() > deadline:
        return
    try:
        out = as_user(p['id'], f"select start_conversation({esc(helena_id)}::uuid, null);")
        conv = re.findall(UUID, out)[-1]
    except Exception as e:  # noqa: BLE001
        log(f"  ✗ {p['name']}: não consegui abrir a conversa ({str(e).splitlines()[0][:110]})")
        return
    sent_at = 0.0
    for i, raw in enumerate(script):
        if STOP.is_set() or time.time() > deadline:
            return
        text = raw.replace('{n}', first)
        # quem digita demora: mensagem maior, pausa maior; a primeira sai já
        if i > 0:
            nap(R.uniform(3, 7) + len(text) * 0.06, slow)
        try:
            send(p['id'], conv, text)
            sent_at = time.time()
            log(f"💬 {p['name']}: “{text}”")
        except Exception as e:  # noqa: BLE001
            log(f"  ✗ {p['name']}: {str(e).splitlines()[0][:110]}")
            return
    # depois do roteiro: se a Helena responder pelo app, a pessoa responde de volta (até 2 vezes)
    replies = 0
    while replies < 2 and not STOP.is_set() and time.time() < deadline:
        nap(4, slow)
        r = q_local(f"select last_sender_id, extract(epoch from last_message_at) as at from conversations where id = {esc(conv)}::uuid")
        if r and r[0]['last_sender_id'] == helena_id and float(r[0]['at']) > sent_at:
            nap(R.uniform(5, 12), slow)
            text = R.choice(REPLIES[min(replies, len(REPLIES) - 1)])
            try:
                send(p['id'], conv, text)
                sent_at = time.time()
                replies += 1
                log(f"↩️  {p['name']} responde à Helena: “{text}”")
            except Exception as e:  # noqa: BLE001
                log(f"  ✗ {p['name']}: {str(e).splitlines()[0][:110]}")
                return


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--minutes', type=float, default=10)
    ap.add_argument('--people', type=int, default=6)
    ap.add_argument('--slow', type=float, default=1.0, help='multiplica todas as pausas (2 = metade da velocidade)')
    ap.add_argument('--once', action='store_true', help='só uma mensagem, para testar')
    a = ap.parse_args()
    signal.signal(signal.SIGINT, lambda *_: STOP.set())
    signal.signal(signal.SIGTERM, lambda *_: STOP.set())

    h = q_local(f"select id, name from profiles where \"profileSlug\" = {esc(HELENA_SLUG)}")
    if not h:
        sys.exit('Helena Prado (helena-prado) não existe neste banco. Este script é só para o banco LOCAL.')
    helena_id = h[0]['id']
    # para as pessoas poderem abrir conversa com ela, o perfil precisa estar recebendo conversas (a regra do app, `profiles.chat_enabled`); é conta de TESTE, só no banco local
    if not q_local(f"select 1 from profiles where id = {esc(helena_id)}::uuid and chat_enabled")  :
        q_local(f"update profiles set chat_enabled = true where id = {esc(helena_id)}::uuid")
        log('  (a Helena estava com "receber conversas" desligado: liguei, senão ninguém consegue puxar conversa com ela)')
    people = q_local("select p.id, p.name from profiles p join auth.users u on u.id = p.id where u.email like 'cliente-%@staging.iuser.test' and p.is_active and p.id <> " + esc(helena_id)
                     + " and p.id not in (" + ','.join(esc(x) for x in RESERVED) + ") order by random() limit " + str(max(1, a.people)))
    if not people:
        sys.exit('Não achei pessoas de teste (cliente-NNN@staging.iuser.test). Rode python3 scripts/local/setup.py.')
    n = 1 if a.once else len(people)
    scripts = R.sample(SCENARIOS, min(n, len(SCENARIOS)))
    while len(scripts) < n:
        scripts.append(R.choice(SCENARIOS))
    deadline = time.time() + a.minutes * 60
    log(f"💌 {n} pessoa{'s' if n != 1 else ''} vão conversar com a {h[0]['name']} por até {a.minutes:g} min (Ctrl-C para parar). Abra o app como {HELENA_SLUG}.")

    threads = []
    for i, (p, sc) in enumerate(zip(people[:n], scripts)):
        # a primeira mensagem sai em segundos; as outras pessoas vão chegando espaçadas, para a notificação continuar vindo
        start = 2 if i == 0 else 2 + i * R.uniform(12, 30)
        t = threading.Thread(target=person_thread, args=(p, helena_id, sc[:1] if a.once else sc, start, a.slow, deadline), daemon=True)
        t.start()
        threads.append(t)
    while not STOP.is_set() and time.time() < deadline and any(t.is_alive() for t in threads):
        STOP.wait(1)
    STOP.set()
    log('✔ fim da conversa')


if __name__ == '__main__':
    main()
