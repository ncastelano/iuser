# Agenda AGITADA do @admin-teste no banco LOCAL: perfil recebendo agendamentos (seg–sáb, 08h–19h, almoço 12–13h), com 10 a 14 pessoas
# DIFERENTES por dia, do passado (concluídos/cancelados) até as próximas duas semanas (aceitos e pendentes para ele responder).
# Idempotente: apaga e refaz os agendamentos de perfil do admin. Só escreve no banco local.
# Uso: python3 scripts/local/seed-agenda.py
import datetime, json, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import q_local, psql, status_env

if 'supabase.co' in status_env()['API_URL']:
    sys.exit('RECUSADO: isto só roda no banco LOCAL.')

admin = q_local('''select id from profiles where "profileSlug"='admin-teste' ''')[0]['id']
hours = {'is_active': True, 'slot_interval': 30, 'blocked_dates': [], 'weekly': {
    **{str(d): {'isOpen': True, 'start': '08:00', 'end': '19:00', 'lunchStart': '12:00', 'lunchEnd': '13:00'} for d in range(1, 7)},
    '0': {'isOpen': False, 'start': '09:00', 'end': '13:00', 'lunchStart': '', 'lunchEnd': ''}}}
q_local(f"update profiles set allow_scheduling=true, working_hours='{json.dumps(hours)}'::jsonb where id='{admin}'")

pool = q_local(f'''select id, "profileSlug" slug, coalesce(avatar_url,'') avatar from profiles
                   where is_active and id <> '{admin}' and "profileSlug" is not null and "profileSlug" <> '' order by id''')
random.seed(22)

SERVICES = ['Reunião de alinhamento', 'Consultoria rápida', 'Mentoria 1:1', 'Apresentação de proposta', 'Café de negócios', 'Revisão de projeto',
            'Atendimento comercial', 'Avaliação de parceria', 'Dúvidas sobre o plano', 'Visita técnica', 'Entrevista', 'Planejamento da semana']

today = datetime.date.today()
rows, per_day = [], {}
for off in range(-5, 15):
    day = today + datetime.timedelta(days=off)
    if day.weekday() == 6:          # domingo fechado
        continue
    people = random.sample(pool, 12 + random.randint(0, 2))      # 12 a 14 pessoas diferentes
    t, i = 8 * 60, 0
    day_rows = []
    while i < len(people):
        dur = random.choice([30, 30, 30, 60])
        if t < 13 * 60 and t + dur > 12 * 60:   # cai no almoço: pula para 13h
            t = 13 * 60
        if t + dur > 19 * 60:
            break
        if random.random() < 0.12:               # um respiro de vez em quando
            t += 30
            continue
        p = people[i]; i += 1
        if off < 0:
            status = random.choices(['completed', 'cancelled'], [0.86, 0.14])[0]
        elif off == 0:
            status = random.choices(['confirmed', 'pending', 'completed'], [0.5, 0.35, 0.15])[0] if t > 10 * 60 else 'completed'
        else:
            status = random.choices(['confirmed', 'pending', 'cancelled'], [0.55, 0.38, 0.07])[0]
        day_rows.append({
            'store_id': None, 'store_slug': '', 'store_name': '', 'store_logo_url': '', 'provider_profile_id': admin, 'owner_id': admin, 'owner_slug': 'admin-teste',
            'customer_id': p['id'], 'customer_slug': p['slug'], 'customer_avatar_url': p['avatar'], 'date': day.isoformat(), 'time': f'{t//60:02d}:{t%60:02d}',
            'duration_minutes': dur, 'service_name': random.choice(SERVICES), 'service_type': 'service', 'people_count': 1, 'status': status,
            'direction': 'outgoing', 'is_public': False,
        })
        t += dur
    per_day[day.isoformat()] = len(day_rows)
    rows += day_rows

# apaga a agenda de perfil anterior do admin e insere de uma vez (gatilhos de guarda/notificação/taxa valem normalmente)
cols = list(rows[0].keys())
def lit(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, int): return str(v)
    return "'" + str(v).replace("'", "''") + "'"
values = ',\n'.join('(' + ', '.join(lit(r[c]) for c in cols) + ')' for r in rows)
sql = f'''begin;
delete from appointments where provider_profile_id='{admin}' and store_id is null;
insert into appointments ({', '.join(cols)}) values
{values};
commit;'''
psql([], stdin=sql)

print('Agenda do @admin-teste:')
for r in q_local(f'''select date, count(*) total, count(distinct customer_id) pessoas,
                            count(*) filter (where status='confirmed') aceitos, count(*) filter (where status='pending') pendentes,
                            count(*) filter (where status='completed') concluidos, count(*) filter (where status='cancelled') cancelados
                     from appointments where provider_profile_id='{admin}' and store_id is null group by 1 order by 1'''):
    print(f"  {r['date']}  {r['total']:>2} agend. / {r['pessoas']:>2} pessoas · aceitos {r['aceitos']} · pendentes {r['pendentes']} · concluídos {r['concluidos']} · cancelados {r['cancelados']}")
