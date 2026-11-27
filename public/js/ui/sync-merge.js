// Regra de conflito entre o que está no aparelho e o que veio do servidor.
//
// O `Store.upsertNote` aplica o que chega por cima (campos `undefined` à parte).
// Isso é certo para reações/tags, mas errado para TEXTO: se este aparelho editou
// uma nota offline e o servidor ainda tem a versão anterior, o snapshot engolia
// a edição mais nova sem aviso. Regra: **o `editedAt` mais recente vence**; em
// empate (mesmo relógio) vale o servidor, para convergir.
//
// Função pura de propósito: é o ponto que precisa de teste explícito.

export function conflitoDeEdicao(local, remoto) {
  if (!local || !remoto) return false;
  if (remoto.text === undefined || remoto.text === null) return false;
  const le = Number(local.editedAt) || 0;
  const re = Number(remoto.editedAt) || 0;
  if (!le || !re) return false;          // sem carimbo não dá para julgar: servidor vence
  if (local.text === remoto.text) return false;
  return le > re;
}
