# modules/

Domínios de negócio (graduação, tarifas, comissão, pontuação, pedidos...), **independentes de versão de interface**.
Nasce vazio de propósito: um domínio é extraído para cá quando for alterado (ver `docs/ARCHITECTURE.md §4`).

```
modules/<dominio>/
  index.ts          # API pública — outros módulos/versões importam SÓ daqui
  domain/           # regras puras (sem React, sem rede) — testáveis com node --test
  application/      # casos de uso
  infrastructure/   # Supabase / serviços externos
  ui/               # componentes do domínio (reutilizáveis pelas versões)
```

Use só as pastas que a complexidade justificar. `modules/*` nunca importa `versions/*` nem `app/*`.
