import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(p, 'utf8');

// Exclusão de conta (LGPD): a função apaga tudo do próprio uid em uma chamada,
// e a UI só dispara com confirmação digitada.
test('função delete_my_account existe no SQL e apaga as tabelas do usuário', () => {
  const sql = read('supabase.sql');
  assert.match(sql, /create or replace function public\.delete_my_account/);
  assert.match(sql, /delete from notes where user_id = uid/);
  assert.match(sql, /delete from threads where user_id = uid/);
  assert.match(sql, /delete from folders where user_id = uid/);
  assert.match(sql, /delete from user_keys where user_id = uid/);
  assert.match(sql, /insert into account_deletions/);
  // não pode virar porta aberta: execução só para autenticado
  assert.match(sql, /revoke all on function public\.delete_my_account\(\) from public/);
  assert.match(sql, /grant execute on function public\.delete_my_account\(\) to authenticated/);
});

test('UI exige confirmação digitada antes de apagar a conta', () => {
  const menus = read('public/partials/menus.txt');
  assert.match(menus, /data-set="delete-account"/);
  const js = read('public/js/ui/settings.js');
  assert.match(js, /rpc\('delete_my_account'\)/);
  assert.match(js, /!== 'APAGAR'/, 'precisa exigir a palavra APAGAR');
  assert.match(js, /notethread\.dev::u::/, 'precisa limpar a chave do aparelho');
});
