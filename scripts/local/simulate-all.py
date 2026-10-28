#!/usr/bin/env python3
"""
Comando ÚNICO dos simuladores (só LOCAL): sobe o simulador do ECOSSISTEMA (o mundo: compras, agendamentos, comunidades, corridas...) e o da PIZZARIA (o ciclo
completo da loja do admin-teste, com os motoristas iUser) juntos, num painel só, com uma linha de log prefixada ([eco] / [pizza]). Cada metade continua sendo o seu
próprio processo (a lógica não mudou) — assim dá para reiniciar UMA delas com outros modos sem derrubar a outra — e quem cai é levantado de novo sozinho.

  python3 -u scripts/local/simulate-all.py                       # os dois, como sempre
  python3 -u scripts/local/simulate-all.py --stage               # TEATRO: a pizzaria deixa Dani/Gabriela/dono para as telas de /tres-telas
  python3 -u scripts/local/simulate-all.py --manual --manual-drivers dani    # você atende a loja e a Dani na mão
  python3 -u scripts/local/simulate-all.py --only pizzaria       # só uma metade (eco | pizzaria)
  python3 -u scripts/local/simulate-all.py --eco "--people 20 --rides 30" --pizzaria "--every 8"   # opções de cada simulador, como são

Com o comando rodando (em outro terminal ou em segundo plano), dá para mexer sem derrubá-lo:
  python3 scripts/local/simulate-all.py ctl status
  python3 scripts/local/simulate-all.py ctl restart pizzaria --stage      # reinicia só a pizzaria, agora no modo Teatro
  python3 scripts/local/simulate-all.py ctl restart pizzaria              # reinicia com os mesmos argumentos de antes
  python3 scripts/local/simulate-all.py ctl restart pizzaria --default    # reinicia no modo padrão (sem --stage, --manual...)
  python3 scripts/local/simulate-all.py ctl restart eco --people 20
  python3 scripts/local/simulate-all.py ctl stop eco                      # para uma metade (ela só volta com start/restart)
  python3 scripts/local/simulate-all.py ctl start eco
  python3 scripts/local/simulate-all.py ctl quit                          # para tudo e sai

Os argumentos de `restart` substituem os da metade (sem argumentos, ela volta com os últimos; `--default` limpa todos). Só roda UM comando destes por vez; simuladores soltos
(`simulate-ecosystem.py` / `simulate-pizzaria.py` abertos à mão) fazem este se recusar — use --take-over para encerrá-los e assumir.
"""
import argparse, json, os, shlex, signal, subprocess, sys, threading, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
STATE = Path.home() / '.iuser-sim'
PID_FILE = STATE / 'launcher.pid'
STATUS_FILE = STATE / 'status.json'
CONTROL_FILE = STATE / 'control'

SIMS = {
    # `log`: o log CRU de cada simulador (sem prefixo) — a página /tres-telas lê o da pizzaria em /tmp/sim-pizzaria.log (rota /api/dev/observer)
    'eco': {'tag': 'eco', 'script': HERE / 'simulate-ecosystem.py', 'color': '36', 'name': 'ecossistema', 'log': '/tmp/sim-ecosystem.log'},
    'pizzaria': {'tag': 'pizza', 'script': HERE / 'simulate-pizzaria.py', 'color': '35', 'name': 'pizzaria', 'log': '/tmp/sim-pizzaria.log'},
}
ALIASES = {'eco': 'eco', 'ecossistema': 'eco', 'pizza': 'pizzaria', 'pizzaria': 'pizzaria'}
TTY = sys.stdout.isatty()
print_lock = threading.Lock()


def emit(tag, color, line):
    stamp = time.strftime('%H:%M:%S')
    prefix = f'\033[{color}m[{tag}]\033[0m' if TTY else f'[{tag}]'
    with print_lock:
        print(f'{prefix} {line}', flush=True)


def note(msg):
    emit('sim', '33', msg)


def alive(pid):
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def stray_simulators():
    """Simuladores abertos fora deste comando (pid, linha de comando)"""
    out = subprocess.run(['pgrep', '-af', r'simulate-(ecosystem|pizzaria)\.py'], capture_output=True, text=True).stdout
    found = []
    for ln in out.splitlines():
        pid_s, _, cmd = ln.partition(' ')
        if pid_s.isdigit() and int(pid_s) != os.getpid() and 'simulate-all.py' not in cmd:
            found.append((int(pid_s), cmd))
    return found


class Child:
    def __init__(self, key, args):
        self.key = key
        self.spec = SIMS[key]
        self.args = args           # lista de argumentos para o simulador
        self.proc = None
        self.wanted = True         # False = parada de propósito
        self.started_at = 0.0
        self.restarts = 0
        self.backoff = 3.0
        self.next_try = 0.0

    def start(self):
        cmd = [sys.executable, '-u', str(self.spec['script']), *self.args]
        self.proc = subprocess.Popen(cmd, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1, start_new_session=True)
        self.started_at = time.time()
        note(f"{self.spec['name']}: no ar (pid {self.proc.pid}) {' '.join(self.args)}".rstrip())
        threading.Thread(target=self._pump, args=(self.proc,), daemon=True).start()

    def _pump(self, proc):
        try:
            raw = open(self.spec['log'], 'w', buffering=1)
        except OSError:
            raw = None
        for line in proc.stdout:
            emit(self.spec['tag'], self.spec['color'], line.rstrip('\n'))
            if raw:
                try: raw.write(line)
                except OSError: pass

    def running(self):
        return self.proc is not None and self.proc.poll() is None

    def stop(self):
        if not self.running():
            return
        try:
            os.killpg(self.proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            self.proc.wait(timeout=8)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(self.proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass


def write_status(children, started):
    data = {
        'pid': os.getpid(), 'since': started, 'updated': time.time(),
        'sims': {k: {'running': c.running(), 'wanted': c.wanted, 'pid': c.proc.pid if c.running() else None, 'args': c.args, 'restarts': c.restarts,
                     'uptime_s': int(time.time() - c.started_at) if c.running() else 0} for k, c in children.items()},
    }
    tmp = STATUS_FILE.with_suffix('.tmp')
    tmp.write_text(json.dumps(data))
    tmp.replace(STATUS_FILE)


def build_parser():
    ap = argparse.ArgumentParser(description='Comando único dos simuladores (ecossistema + pizzaria). Veja o topo do arquivo.')
    ap.add_argument('--only', choices=['eco', 'pizzaria'], help='sobe só uma metade')
    ap.add_argument('--eco', default='', help='argumentos do simulate-ecosystem.py, entre aspas')
    ap.add_argument('--pizzaria', default='', help='argumentos do simulate-pizzaria.py, entre aspas')
    # atalhos mais usados da pizzaria
    ap.add_argument('--stage', action='store_true', help='(pizzaria) TEATRO')
    ap.add_argument('--manual', action='store_true', help='(pizzaria) você atende a loja')
    ap.add_argument('--manual-drivers', default='', help='(pizzaria) motoristas que você mexe na mão, ex.: dani,leo')
    ap.add_argument('--stage-speed', type=float, help='(pizzaria) velocidade da Dani no Teatro')
    ap.add_argument('--take-over', action='store_true', help='encerra simuladores soltos e assume')
    return ap


def pizzaria_shortcuts(a):
    out = []
    if a.stage: out.append('--stage')
    if a.manual: out.append('--manual')
    if a.manual_drivers: out += ['--manual-drivers', a.manual_drivers]
    if a.stage_speed is not None: out += ['--stage-speed', str(a.stage_speed)]
    return out


def run(a):
    STATE.mkdir(parents=True, exist_ok=True)
    if PID_FILE.exists():
        try:
            other = int(PID_FILE.read_text().strip())
        except ValueError:
            other = 0
        if other and alive(other):
            sys.exit(f'Já existe um comando dos simuladores rodando (pid {other}). Mexa nele com: simulate-all.py ctl status | restart | stop | quit')
    stray = stray_simulators()
    if stray:
        if not a.take_over:
            sys.exit('Há simuladores soltos rodando (' + ', '.join(f'{p}' for p, _ in stray) + '). Use --take-over para encerrá-los e assumir, ou pare-os antes.')
        for pid, _ in stray:
            try: os.kill(pid, signal.SIGTERM)
            except OSError: pass
        time.sleep(2)
        note(f'{len(stray)} simulador(es) solto(s) encerrado(s).')

    PID_FILE.write_text(str(os.getpid()))
    CONTROL_FILE.write_text('')
    keys = [a.only] if a.only else ['eco', 'pizzaria']
    children = {}
    for k in keys:
        args = shlex.split(a.eco if k == 'eco' else a.pizzaria)
        if k == 'pizzaria':
            args += pizzaria_shortcuts(a)
        children[k] = Child(k, args)
    started = time.time()
    quitting = {'v': False}

    def bye(*_):
        quitting['v'] = True
    signal.signal(signal.SIGINT, bye)
    signal.signal(signal.SIGTERM, bye)

    for c in children.values():
        c.start()
    ctl_pos = 0
    try:
        while not quitting['v']:
            now = time.time()
            # quem caiu sem ser de propósito volta (com espera crescente)
            for c in children.values():
                if c.wanted and not c.running():
                    if c.next_try == 0:
                        ran = now - c.started_at
                        c.backoff = 3.0 if ran > 60 else min(60.0, c.backoff * 2)
                        c.next_try = now + c.backoff
                        note(f"{c.spec['name']}: parou (código {c.proc.returncode if c.proc else '?'}); volta em {int(c.backoff)} s")
                    elif now >= c.next_try:
                        c.next_try = 0
                        c.restarts += 1
                        c.start()
            # comandos do `ctl`
            try:
                with open(CONTROL_FILE) as f:
                    f.seek(ctl_pos)
                    chunk = f.read()
                    ctl_pos = f.tell()
            except OSError:
                chunk = ''
            for ln in chunk.splitlines():
                try:
                    cmd = json.loads(ln)
                except ValueError:
                    continue
                handle(cmd, children, quitting)
            write_status(children, started)
            time.sleep(1)
    finally:
        note('encerrando…')
        for c in children.values():
            c.wanted = False
            c.stop()
        for f in (PID_FILE, STATUS_FILE):
            try: f.unlink()
            except OSError: pass


def handle(cmd, children, quitting):
    op = cmd.get('op')
    if op == 'quit':
        note('pedido para encerrar tudo')
        quitting['v'] = True
        return
    targets = [ALIASES[t] for t in (cmd.get('targets') or []) if t in ALIASES] or list(children)
    for k in targets:
        c = children.get(k)
        if c is None:
            note(f'{k}: esta metade não foi iniciada neste comando (use ctl restart depois de subir sem --only)')
            continue
        if op == 'stop':
            c.wanted = False
            c.stop()
            note(f"{c.spec['name']}: parada de propósito")
        elif op in ('start', 'restart'):
            if cmd.get('args') == ['--default']:
                c.args = []
            elif cmd.get('args'):
                c.args = cmd['args']
            c.stop()
            c.wanted = True
            c.next_try = 0
            c.backoff = 3.0
            c.start()


def ctl(argv):
    # Sem argparse de propósito: os argumentos de `restart` são opções do simulador (--stage...) e não podem ser tomados como nossas
    OPS = ('status', 'restart', 'start', 'stop', 'quit')
    if not argv or argv[0] not in OPS:
        sys.exit('Uso: simulate-all.py ctl ' + '|'.join(OPS) + ' [eco|pizzaria] [argumentos do simulador]')
    op, rest = argv[0], argv[1:]
    target = rest[0] if rest and rest[0] in ALIASES else None
    extra = rest[1:] if target else rest
    if extra and extra[0] == '--':
        extra = extra[1:]
    running = PID_FILE.exists() and alive(int(PID_FILE.read_text().strip() or 0))
    if op == 'status':
        if not running or not STATUS_FILE.exists():
            sys.exit('Nenhum comando dos simuladores está rodando.')
        st = json.loads(STATUS_FILE.read_text())
        print(f"comando no ar há {int(time.time() - st['since'])} s (pid {st['pid']})")
        for k, s in st['sims'].items():
            state = 'rodando' if s['running'] else ('PARADA de propósito' if not s['wanted'] else 'caída (voltando)')
            print(f"  {SIMS[k]['name']:<12} {state:<20} pid {s['pid'] or '-':<6} há {s['uptime_s']} s · reinícios {s['restarts']} · args: {' '.join(s['args']) or '(padrão)'}")
        return
    if not running:
        sys.exit('Nenhum comando dos simuladores está rodando (suba com: python3 -u scripts/local/simulate-all.py).')
    cmd = {'op': op, 'targets': [target] if target else [], 'args': extra}
    with open(CONTROL_FILE, 'a') as f:
        f.write(json.dumps(cmd) + '\n')
    print(f"enviado: {op} {target or '(as duas)'} {' '.join(extra)}".rstrip())


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'ctl':
        ctl(sys.argv[2:])
    else:
        run(build_parser().parse_args())
