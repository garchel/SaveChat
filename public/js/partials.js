// Injeta os partials do index.html em DEV.
//
// Em dev, public/index.html traz marcadores <!--#include file=partials/x.txt-->
// (comentários HTML: o browser os ignora, então não há markup quebrado nem
// flash de conteúdo). Este módulo busca cada partial e insere o conteúdo no
// lugar do marcador, ANTES do app subir — sem isso a tela de login e a sidebar
// simplesmente não existiriam.
//
// Em produção o build (scripts/build.mjs) substitui os marcadores no arquivo,
// então este módulo não acha nenhum e sai sem fazer fetch nenhum.
//
// PITFALL (custou um bug inteiro de tela em branco): no DOM, o nodeValue de um
// nó COMMENT é o TEXTO DENTRO dos delimitadores. Um comentário escrito como
// <!--#include file=x.txt--> tem nodeValue === '#include file=x.txt' — SEM o
// <!-- e sem o -->. Por isso o regex abaixo NÃO casa os delimitadores.

const MARK = /^\s*#include\s+file\s*=\s*(\S+?)\s*$/;

export async function injectPartials() {
  // app.js é type=module e roda depois do parse, então <body> existe. O guard
  // cobre o caso de o módulo ser carregado no <head> no futuro.
  if (!document.body) {
    await new Promise((r) => document.addEventListener('DOMContentLoaded', r, { once: true }));
  }

  // Os marcadores são COMENTÁRIOS: não aparecem em querySelector nem em
  // innerHTML, então precisam ser percorridos com um TreeWalker.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
  const targets = [];
  let n = walker.nextNode();
  while (n) {
    const m = MARK.exec(n.nodeValue || '');
    if (m) targets.push({ node: n, path: m[1] });
    n = walker.nextNode();
  }
  if (!targets.length) return 0;

  await Promise.all(targets.map(async ({ node, path }) => {
    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const html = await res.text();
      node.parentNode.replaceChild(document.createRange().createContextualFragment(html), node);
    } catch (err) {
      // nunca engolir em silêncio: sem este aviso o sintoma é só "não existe
      // elemento X" lá no app, longe da causa
      console.warn('[partials] falha ao carregar ' + path, err);
    }
  }));
  return targets.length;
}
