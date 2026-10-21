# Play Store — Textos de listagem (SaveChat)

> Prontos para colar no Play Console. Revisados 21/10/2026 contra a v1.25.0 — o inventário completo está em [ESTADO_ATUAL.md](ESTADO_ATUAL.md).

## Título do app (máx 30 caracteres)

```
SaveChat: Notas como Conversas
```

## Descrição curta (máx 80 caracteres)

```
Salve suas ideias como mensagens. Notas simples, organizadas, offline-first.
```

## Descrição completa

```
Seus pensamentos merecem um lugar melhor que o grupo da família. 😄

SaveChat transforma anotações em conversas: você escreve como se fosse mandar
mensagem, mas tudo fica salvo, organizado e fácil de encontrar.

✅ POR QUE O SAVECHAT É DIFERENTE?

• Formato de chat — se você sabe mandar mensagem, já sabe usar
• Checklists interativos — marque itens direto na mensagem
• Assistente de IA — pede um resumo, uma ideia ou “crie uma nota”
• Mensagens de voz com transcrição — fale e o texto fica na conversa
• Busca poderosa — filtre por tag, conversa, data ou reação (#compras in:trabalho)
• Lembretes com notificação — o app avisa no horário, com ele aberto
• Tarefas e Diária — checklists reunidos, rotina com progresso e streak
• Menções entre notas — conecte ideias com @[nome]
• Mensagens fixadas — o importante sempre no topo
• Temas acolhedores — 8 temas, incluindo modo escuro
• Mascote personalizável — nome, cores, silhueta e acessórios
• Offline-first — funciona sem internet, sincroniza quando volta

🗂️ ORGANIZAÇÃO SEM ESFORÇO

Organize suas conversas em cadernos, favorite o que mais usa e fixe mensagens
importantes. Suas ideias ficam guardadas num lugar só — sem se perder no meio
de grupos e memes.

🔒 SEUS DADOS, SEUS

Suas conversas ficam salvas no dispositivo e sincronizadas com sua conta Google
ou e-mail. Tarefas próprias e a rotina da Diária ficam neste aparelho. Você pode
exportar suas conversas em JSON ou Markdown e excluir conversas pelo app.

Baixe agora e transforme aquele monte de ideias soltas em conversas organizadas.
```

---

## Checklist Data Safety (Play Console)

| Pergunta | Resposta |
|---|---|
| Coleta dados? | Sim |
| Tipo: e-mail | Sim (login Google) — compartilhado com Google OAuth |
| Tipo: conteúdo do usuário (texto/fotos/áudio) | Sim — armazenado no Supabase, não compartilhado |
| Criptografia em trânsito | Sim (HTTPS) |
| Usuário pode solicitar exclusão | Parcial: “Apagar tudo” remove notas/cadernos; imagens e áudios ainda ficam no bucket (B17 no backlog) — **resolver antes de publicar** |
| Compromisso com família/políticas | Segue políticas completas |

---

## Assets prontos

| Asset | Arquivo | Status |
|---|---|---|
| Ícone 512×512 | `public/icons/icon-512.png` | ✅ (o antigo `assets/logo.png` não é o ícone do launcher) |
| Feature graphic 1024×500 | `docs/store-screenshots/feature-graphic.png` | ✅ |
| Screenshot phone 1 | `docs/store-screenshots/phone-main.png` | ✅ |
| Screenshot phone 2 | `docs/store-screenshots/phone-chat.png` | ✅ |

✅ Screenshots regeradas em 25/08/2026, pós-rebrand (logo SaveChat visível). Só regererar se o tema default mudar antes do envio à loja.
