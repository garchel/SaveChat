import { test, expect } from '@playwright/test';

// O botão ‹ na tela e o arrasto chamavam goBack(), mas o botão FÍSICO de
// voltar do aparelho não tinha integração: não havia handler de popstate.
// No Android, sair de um modal, de um menu ou de uma nota levava a um
// "sai do app" em vez de fechar a camada.
//
// A hierarquia é a mesma dos outros dois gatilhos, um nível por gesto:
//   1. fecha a camada aberta (modal, menu, preview da nota)
//   2. volta a conversa para o explorador
//   3. no explorador, minimiza (ou avisa, numa PWA sem API de minimizar)
//
// Este teste usa page.goBack(), que dispara o mesmo popstate que o botão
// do aparelho dispara.
test.describe('botão físico de voltar do celular', () => {
  const vis = (page, id) => page.evaluate(i => {
    const e = document.getElementById(i);
    return !!e && !e.classList.contains('hidden');
  }, id);
  const showChat = (page) => page.evaluate(() =>
    document.getElementById('app').classList.contains('show-chat'));
  // o aviso é .app-toast com a classe .show (medido: é o que toast() renderiza)
  const toastAvisou = (page) => page.evaluate(() => {
    const t = document.querySelector('.app-toast');
    return !!t && t.classList.contains('show') && /lista de conversas/.test(t.textContent || '');
  });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1200);
    await page.evaluate(async () => {
      const { Store } = await import('/js/store.js');
      Store.load();
      Store.setUser({ name: 'Ana', mail: 'ana@note.app' });
      if (!Store.threadList().some(t => t.id === 'seed-back')) {
        Store.upsertThread({ id: 'seed-back', name: 'Conversa', updatedAt: Date.now() });
        Store.upsertNote({ clientId: 'nb-1', threadId: 'seed-back', text: 'ola', ts: Date.now() });
      }
      Store.save();
    });
    await page.reload();
    await page.waitForTimeout(2200);
  });

  test('existe handler de popstate e a pilha ganha uma entrada base', async ({ page }) => {
    // sem a entrada base, um deep link deixaria o primeiro "voltar" fechar
    // o app em vez de passar por goBack
    expect(await page.evaluate(() => !!window.NoteThread.UI._historyBackBound)).toBe(true);
    expect(await page.evaluate(() => history.length)).toBeGreaterThan(1);
  });

  test('modal aberto fecha sem navegar', async ({ page }) => {
    await page.evaluate(() => window.NoteThread.UI.showModal('Teste', '<p>x</p>'));
    await expect.poll(() => vis(page, 'modal')).toBe(true);
    await page.goBack();
    await expect.poll(() => vis(page, 'modal')).toBe(false);
    // não pode ter caído para o explorador junto: um gesto, um nível
    expect(await showChat(page)).toBe(false);
  });

  test('preview da nota fecha e devolve ao explorador', async ({ page }) => {
    await page.evaluate(() => window.NoteThread.UI.showNotePreview('seed-back'));
    await expect.poll(() => vis(page, 'note-preview')).toBe(true);
    await page.goBack();
    await expect.poll(() => vis(page, 'note-preview')).toBe(false);
    expect(await showChat(page)).toBe(false);
  });

  test('conversa + nota são dois gestos: a nota fecha primeiro', async ({ page }) => {
    await page.locator('.tnode').first().click();
    await expect.poll(() => showChat(page)).toBe(true);
    await page.evaluate(() => window.NoteThread.UI.showNotePreview('seed-back'));
    await expect.poll(() => vis(page, 'note-preview')).toBe(true);

    await page.goBack();                       // 1º: fecha a nota
    await expect.poll(() => vis(page, 'note-preview')).toBe(false);
    expect(await showChat(page)).toBe(true);   // a conversa continua aberta

    await page.goBack();                       // 2º: volta ao explorador
    await expect.poll(() => showChat(page)).toBe(false);
  });

  test('no explorador, avisa em vez de fingir que minimizou', async ({ page }) => {
    // sem API de minimize numa PWA, o caminho é o toast de informação
    const urlAntes = page.url();
    await page.goBack();
    await expect.poll(() => toastAvisou(page)).toBe(true);
    expect(page.url()).toBe(urlAntes);
    expect(await showChat(page)).toBe(false);
    // o app NÃO pode ter sido descarregado pela navegação
    expect(await page.evaluate(() => !!document.getElementById('app'))).toBe(true);
  });

  test('camadas empilhadas: um gesto por camada', async ({ page }) => {
    await page.evaluate(() => window.NoteThread.UI.showModal('A', '<p>1</p>'));
    await expect.poll(() => vis(page, 'modal')).toBe(true);
    await page.goBack();
    await expect.poll(() => vis(page, 'modal')).toBe(false);

    await page.evaluate(() => window.NoteThread.UI.showNotePreview('seed-back'));
    await expect.poll(() => vis(page, 'note-preview')).toBe(true);
    await page.goBack();
    await expect.poll(() => vis(page, 'note-preview')).toBe(false);
  });

  test('o botão ‹ na tela continua no mesmo nível (sem regressão)', async ({ page }) => {
    await page.locator('.tnode').first().click();
    await expect.poll(() => showChat(page)).toBe(true);
    await page.locator('#btn-back').click();
    await expect.poll(() => showChat(page)).toBe(false);
  });
});
