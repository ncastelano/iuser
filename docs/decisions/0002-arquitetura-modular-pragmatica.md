# 0002 — Monólito modular, feature-based, sem migração em massa

**Status:** aceita · **Data:** 2026-10-15

## Contexto
O código cresceu "plano" (`components/`, `lib/`, `hooks/`: ~460 arquivos). Queremos convenções previsíveis para o que
vem, sem reescrever o que funciona.

## Decisão
Monólito modular com camadas pragmáticas (`app` → `versions` → `modules` → `lib`), regras de dependência em
`docs/ARCHITECTURE.md §4`, e adoção **gradual** (strangler): código novo segue a estrutura; código antigo migra quando
for tocado e houver ganho real. `src/modules/` é criado vazio e só ganha domínios (graduação, tarifas, comissão,
pontuação, pedidos) quando eles forem alterados.

## Alternativas consideradas
- **Migrar tudo para `modules/` de uma vez** — risco alto, sem ganho imediato, conflita com "não fazer refatoração
  massiva". Rejeitado.
- **Manter tudo plano** — não resolve a previsibilidade de onde colocar o que vem. Rejeitado.
- **Clean Architecture/DDD completos** — cerimônia desproporcional ao app. Rejeitado; usados só onde há regra rica.

## Consequências
- Convivem dois estilos por um tempo; a regra de importação evita que o novo dependa do que não deve.
- Quem criar um domínio novo segue `modules/<dominio>/{domain,application,infrastructure,ui}` (só as pastas necessárias).
