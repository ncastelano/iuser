// Garante que nenhum código novo volta a usar o snackbar do sonner: todo aviso passa por src/lib/toast (a ilha da 3.0 / a pílula do fallback).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(p) ? [p] : [] })

test('ninguém importa sonner (o aviso é da ilha, via lib/toast)', () => {
  const bad = walk('src').filter((p) => /from\s+['"]sonner['"]/.test(readFileSync(p, 'utf8')))
  assert.deepEqual(bad, [], `use '@/lib/toast' em vez de 'sonner': ${bad.join(', ')}`)
})

test('providers não monta o <Toaster /> do sonner', () => {
  assert.ok(!/<Toaster/.test(readFileSync('src/app/providers.tsx', 'utf8')))
})

test('ninguém usa alert() do navegador: todo aviso vai para a ilha (lib/toast)', () => {
  const bad = walk('src').filter((p) => readFileSync(p, 'utf8').split('\n').some((l) => /(^|[^\w.])alert\(/.test(l) && !/role="alert"/.test(l)))
  assert.deepEqual(bad, [], `troque alert() por toast.* de '@/lib/toast': ${bad.join(', ')}`)
})
