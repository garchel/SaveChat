
import { now } from './utils.js';
import { isEncryptedPayload } from './crypto-session.js';
// A constante do id da thread da IA é DUPLICADA aqui de propósito (não
// importada): ai-thread.js lê `window.NoteThread.Store` para evitar
// dependência circular com este módulo, e o repo tem a regra de replicar
// constantes de módulo em vez de extrair um módulo compartilhado
// (tests/orphans.test.js a garante).
const AI_THREAD_ID = 'ai-assistant';

  // ===================================================================
  // STORE (offline-first, localStorage)
  // data: { user, threads:{}, folders:{}, notes:{}, ui:{expanded:{}} }
  // thread: { id, name, emoji, folderId|null, favorite:bool, createdAt, updatedAt, lastPreview }
  // folder: { id, name, parentId|null, createdAt }
  // ---------------------------------------------------------------------
  // ISOLAMENTO POR CONTA (v1.13.3)
  // Antes, TODO o conteúdo vivia em uma única chave `notethread.v2`, junto com
  // o usuário logado. Consequência: entrar com outra conta no mesmo navegador
  // reusava as conversas da conta anterior (e a chave da IA vazava junto).
  // Agora o conteúdo é particionado por conta:
  //   notethread.v2           → sessão + preferências DO DISPOSITIVO (tema, som…)
  //   notethread.v2::u::<id> → { threads, folders, notes, scope } da conta
  // `scope` guarda o que é pessoal e NÃO é preference: chave da IA, histórico
  // do chat com a IA e a rotina da Diária.
  // ===================================================================
  export const Store = {
    KEY: 'notethread.v2',
    // chaves que pertencem à CONTA (viajam no bucket) e não ao dispositivo
    SCOPE_KEYS: ['aiKey', 'aiModel', 'aiChat', 'dailyRoutine'],
    data: null,
    _uid: null,
    // --- Criptografia do cache local (Fase 1) ---
    // cipher: { uid, encrypt(payload), decrypt(envelope) } — ver crypto-session.js
    // locked: bucket cifrado no disco e chave ainda não disponível em memória
    // _encrypted: esta conta JÁ teve dados cifrados; nunca mais gravar claro
    cipher: null,
    locked: false,
    _encrypted: false,
    _encryptedBucket: null,
    _writes: Promise.resolve(),

    // id estável da conta ativa (id do Supabase > e-mail > 'anon')
    _accountId(user) {
      if (!user) return 'anon';
      return String(user.id || user.mail || 'anon');
    },
    _bucketKey(uid) { return this.KEY + '::u::' + uid; },
    _read(key) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } },
    _write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} },

    // A thread da IA é ESTRUTURAL DO DISPOSITIVO, não da conta: existe em
    // qualquer conta e não carrega conteúdo de conta nenhuma. Ela entra no
    // bucket da conta ativa como qualquer outra thread (o `save()` grava
    // `data.threads` inteiro), mas o ISOLAMENTO entre contas é garantido no
    // load: a thread é REMOVIDA do bucket recém-carregado e re-injetada —
    // assim "conta nova começa com zero threads" continua verdade
    // (tests/e2e/account-isolation.spec.js mede `threads: []`).
    //
    // Medido antes deste fix: a conta nova via 3 threads em vez de 0, porque
    // `ensureAiThread` gravava a thread e ela persistia no bucket.
    //
    // O histórico da conversa (`ui.aiChat` + as notas espelhadas) continua
    // no bucket da conta — lá é conteúdo da conta, e o escopo `aiChat`/`aiKey`
    // já existia em SCOPE_KEYS.
    load() {
      const root = this._read(this.KEY) || {};
      const uid = this._accountId(root.user);
      this._uid = uid;

      // migração do formato antigo (conteúdo na raiz) para o bucket da conta
      if (root.threads || root.folders || root.notes) {
        const prev = this._read(this._bucketKey(uid)) || { threads: {}, folders: {}, notes: {}, scope: {} };
        this._write(this._bucketKey(uid), {
          threads: Object.assign({}, prev.threads, root.threads),
          folders: Object.assign({}, prev.folders, root.folders),
          notes: Object.assign({}, prev.notes, root.notes),
          scope: prev.scope || {},
        });
        delete root.threads; delete root.folders; delete root.notes;
        this._write(this.KEY, root);
      }

      const bucket = this._read(this._bucketKey(uid)) || {};
      // `ui` = preferências do dispositivo + o escopo da conta re-injetado, para
      // que o código existente leia Store.data.ui.dailyRoutine sem mudar.
      const ui = Object.assign({}, root.ui || {});

      // Cache cifrado (Fase 1): sem a DEK em memória não há como abrir o
      // bucket. O app sobe bloqueado e o CryptoGate pede a senha; o conteúdo
      // só entra em memória em `hydrate()`, depois do unlock. Preferências do
      // DISPOSITIVO (tema, som…) continuam disponíveis porque moram na raiz.
      const encrypted = isEncryptedPayload(bucket);
      this._encrypted = encrypted;
      this._encryptedBucket = encrypted ? bucket : null;
      this.locked = encrypted;
      if (!encrypted) Object.assign(ui, bucket.scope || {});

      const d = {
        user: root.user || null,
        threads: encrypted ? {} : (bucket.threads || {}),
        folders: encrypted ? {} : (bucket.folders || {}),
        notes: encrypted ? {} : (bucket.notes || {}),
        ui,
      };
      // A thread da IA é do dispositivo, não da conta: sai do bucket dela
      // antes de virar `data.threads`. `ensureAiThread()` (chamado no boot,
      // em app.js) a recoloca em memória. Sem isto, a thread gravada numa
      // conta aparecia na conta seguinte — medido como 3 threads onde o
      // contrato exige 0.
      if (d.threads[AI_THREAD_ID]) delete d.threads[AI_THREAD_ID];
      d.threads = d.threads || {}; d.folders = d.folders || {}; d.notes = d.notes || {};
      d.ui = d.ui || {}; d.ui.expanded = d.ui.expanded || {};
      // sons padrão para novos usuários (mapeamento de ação -> som cuelume)
      const defaultSounds = { enabled: false, volume: 0.6, map: {
        send: 'scan', pin: 'bloom', favorite: 'sparkle', delete: 'pulse', create: 'bloom', error: 'error', open: 'tick'
      } };
      d.ui.sounds = d.ui.sounds || defaultSounds;
      // o save() no fim e' gated por `migrated`; o rename usa flag propria
      let themeRenamed = false;
      // v1.16.0: 'peach' virou 'terracota' (a bolha escureceu para o texto
      // branco da mensagem passar de 4.75:1). Quem tinha 'peach' salvo e'
      // migrado — e o save() no fim persiste, entao a migracao e' de uma vez.
      if (d.ui.theme === 'peach') { d.ui.theme = 'terracota'; themeRenamed = true; }
    d.ui.theme = d.ui.theme || 'terracota';
      // v1.21.3: a família gemini-2.5 foi aposentada para chaves novas — quem
      // tinha o modelo salvo passaria a receber 404. Limpa para o padrão atual.
      let aiModelReset = false;
      if (d.ui.aiModel && /^gemini-2\.5/.test(d.ui.aiModel)) { d.ui.aiModel = ''; aiModelReset = true; }
      // migração: limpa flag "pending" de notas antigas (dados de versões anteriores)
      let migrated = false;
      Object.values(d.notes).forEach((arr) => arr.forEach((n) => { if (n.pending) { n.pending = false; migrated = true; } }));
      // auto-cura: remove notas duplicadas por clientId e garante sortOrder único.
      // Protege a renderização de dados corrompidos por versões antigas (sintoma:
      // mensagens aparecendo duas vezes na mesma conversa).
      Object.entries(d.notes).forEach(([tid, arr]) => {
        if (!Array.isArray(arr)) return;
        const seen = new Set();
        const clean = arr.filter((n) => {
          if (!n || !n.clientId || seen.has(n.clientId)) return false;
          seen.add(n.clientId); return true;
        });
        if (clean.length !== arr.length) { d.notes[tid] = clean; migrated = true; }
        clean.forEach((x, idx) => { if (x.sortOrder == null) { x.sortOrder = idx; migrated = true; } });
      });
      this.data = d;
      if (migrated || themeRenamed || aiModelReset) this.save();
      // cura de double-send também nos dados LOCAIS: builds antigos salvavam a
      // mesma nota com client_id diferente a cada tentativa — gêmeas no localStorage
      // renderizam duplicadas em todo boot sem nunca passar pelo snapshot
      Object.keys(this.data.notes).forEach((tid) => this.dedupeIdentical(tid));
      return d;
    },

    // grava: raiz = sessão + prefs do dispositivo; bucket = conteúdo da conta
    save() {
      const root = this._read(this.KEY) || {};
      root.user = this.data.user || null;
      const ui = {};
      const scope = {};
      Object.keys(this.data.ui || {}).forEach((k) => {
        if (this.SCOPE_KEYS.indexOf(k) >= 0) scope[k] = this.data.ui[k];
        else ui[k] = this.data.ui[k];
      });
      root.ui = ui;
      this._write(this.KEY, root);

      // Ainda bloqueado: o conteúdo no disco é ciphertext e não existe em
      // memória. Gravar aqui apagaria o cache da conta.
      if (this.locked) return;

      // A thread da IA é do DISPOSITIVO, não da conta: não vai para o
      // bucket. Sem este filtro ela era gravada lá e aparecia na conta
      // seguinte — medido como 3 threads onde o contrato de isolamento
      // (tests/e2e/account-isolation.spec.js, que lê o bucket cru do
      // localStorage) exige 1.
      const threadsSemIa = {};
      Object.keys(this.data.threads || {}).forEach((id) => {
        if (id === AI_THREAD_ID) return;
        threadsSemIa[id] = this.data.threads[id];
      });
      // As NOTAS espelhadas da conversa com a IA também são do dispositivo
      // (são o histórico local-only) — saem do bucket pelo mesmo motivo.
      const notesSemIa = {};
      Object.keys(this.data.notes || {}).forEach((id) => {
        if (id === AI_THREAD_ID) return;
        notesSemIa[id] = this.data.notes[id];
      });
      const uid = this._uid || this._accountId(this.data.user);
      const payload = {
        threads: threadsSemIa,
        folders: this.data.folders,
        notes: notesSemIa,
        scope,
      };
      // só cifra com a chave da PRÓPRIA conta: depois de um logout/troca, a
      // DEK antiga ainda pode estar em memória por alguns instantes
      const cipher = (this.cipher && this.cipher.uid === uid) ? this.cipher : null;
      if (!cipher) {
        // Conta que já teve cache cifrado NUNCA volta a gravar texto claro.
        // Uma gravação sem chave é descartada (o `flush()` do logout garante
        // que a última alteração chegue ao disco antes de soltar a DEK).
        if (this._encrypted) return;
        this._write(this._bucketKey(uid), payload);
        return;
      }
      this._queueEncryptedWrite(uid, payload, cipher);
    },

    // Grava o bucket cifrado em série (uma cifragem por save, na ordem das
    // chamadas). `flush()` espera a fila antes de a chave sair de memória.
    _queueEncryptedWrite(uid, payload, cipher) {
      this._writes = this._writes
        .then(() => cipher.encrypt(payload))
        .then((envelope) => this._write(this._bucketKey(uid), envelope))
        .catch((e) => { console.warn('[store] falha ao cifrar o cache local', e); });
      return this._writes;
    },

    async flush() {
      // Duas rodadas: uma gravação pode ser enfileirada enquanto a primeira
      // termina.
      await this._writes;
      await this._writes;
    },

    // Liga a criptografia do cache à conta ativa. Sem argumento, desliga
    // (logout/troca de conta). Trocar a chave não reescreve o bucket antigo.
    setCipher(cipher) {
      const same = cipher && this.cipher && this.cipher.uid === cipher.uid;
      this.cipher = cipher || null;
      if (!cipher) return;
      this._encrypted = true;
      // conta legada (bucket claro) passa a gravar cifrado já no próximo save
      if (!this.locked && !same) this.save();
    },

    clearCipher() { this.cipher = null; },

    // Abre o bucket cifrado depois do unlock. Devolve true quando havia algo
    // para decifrar. A thread e as notas da IA são do dispositivo e ficam.
    async hydrate() {
      if (!this.locked) return false;
      if (!this._encryptedBucket) { this.locked = false; return false; }
      if (!this.cipher) throw new Error('Criptografia bloqueada.');
      const bucket = await this.cipher.decrypt(this._encryptedBucket);
      const aiThread = this.data.threads[AI_THREAD_ID];
      const aiNotes = this.data.notes[AI_THREAD_ID];
      this.data.threads = (bucket && bucket.threads) || {};
      this.data.folders = (bucket && bucket.folders) || {};
      this.data.notes = (bucket && bucket.notes) || {};
      if (aiThread) this.data.threads[AI_THREAD_ID] = aiThread;
      if (aiNotes) this.data.notes[AI_THREAD_ID] = aiNotes;
      this.data.ui = Object.assign({}, this.data.ui, (bucket && bucket.scope) || {});
      this.data.ui.expanded = this.data.ui.expanded || {};
      this._encryptedBucket = null;
      this.locked = false;
      this.save();
      return true;
    },

    // Aplica o bucket da conta informada (claro ou cifrado). Usado no boot
    // (load) e na troca de conta (setUser).
    _loadBucketInto(uid) {
      const bucket = this._read(this._bucketKey(uid)) || {};
      if (isEncryptedPayload(bucket)) {
        this._encryptedBucket = bucket;
        this._encrypted = true;
        // Sempre bloqueado: só o `hydrate()`, depois do unlock, troca o
        // ciphertext pelo conteúdo em memória. Se abrisse "destravado" aqui,
        // o próximo save gravaria um bucket vazio por cima do cache.
        this.locked = true;
        return;
      }
      this._encryptedBucket = null;
      this._encrypted = false;
      this.locked = false;
      this.data.threads = bucket.threads || {};
      this.data.folders = bucket.folders || {};
      this.data.notes = bucket.notes || {};
      Object.assign(this.data.ui, bucket.scope || {});
    },


    // TROCA DE CONTA: descarrega o conteúdo da conta anterior no bucket dela e
    // carrega o da nova. Sem isso, logar com outro e-mail no mesmo navegador
    // herdava as conversas da conta antiga.
    setUser(u) {
      const nextUid = this._accountId(u);
      const cur = this.data && this.data.user;
      const sameAccount = nextUid === this._accountId(cur);
      this.data.user = u || null;
      if (sameAccount) { this.save(); return; }

      // 1) persiste o conteúdo atual no bucket da conta que está saindo
      this._uid = this._accountId(cur);
      this.save();

      // 2) reinicia o estado em memória (listas, contadores, pins). As
      //    preferências do DISPOSITIVO (tema, som, fonte, densidade) são
      //    preservadas: não pertencem à conta, são do aparelho.
      const devicePrefs = {};
      Object.keys(this.data.ui || {}).forEach((k) => {
        if (this.SCOPE_KEYS.indexOf(k) < 0) devicePrefs[k] = this.data.ui[k];
      });
      this.data.threads = {};
      this.data.folders = {};
      this.data.notes = {};
      this.data.ui = Object.assign({ expanded: {} }, devicePrefs);

      // 3) carrega o bucket da nova conta (claro ou cifrado)
      this._uid = nextUid;
      this._loadBucketInto(nextUid);
      this.data.ui.expanded = this.data.ui.expanded || {};
      this.save();
    },
    get user() { return this.data.user; },

    // userId estável por DISPOSITIVO — usado para marcar reações. Mora na raiz
    // (fora do bucket) de propósito: trocar de conta não pode gerar um id novo,
    // senão as reações que o usuário já deu aparecem como de outra pessoa.
    getUserId() {
      const root = this._read(this.KEY) || {};
      if (!root.deviceId) {
        root.deviceId = (crypto.randomUUID ? crypto.randomUUID() : 'u-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
        // preserva o resto da raiz (user, ui) ao gravar
        this._write(this.KEY, Object.assign(root, { user: this.data.user || null, ui: (() => {
          const ui = {}; Object.keys(this.data.ui || {}).forEach((k) => { if (this.SCOPE_KEYS.indexOf(k) < 0) ui[k] = this.data.ui[k]; }); return ui;
        })() }));
      }
      return root.deviceId;
    },

    // ---- folders ----
    folderList() { return Object.values(this.data.folders).sort((a, b) => a.name.localeCompare(b.name)); },
    getFolder(id) { return this.data.folders[id]; },
    upsertFolder(f) { this.data.folders[f.id] = Object.assign(this.data.folders[f.id] || {}, f); this.save(); },
    deleteFolder(id, recursive) {
      const del = (fid) => {
        Object.values(this.data.threads).forEach((t) => { if (t.folderId === fid) { if (recursive) delete this.data.threads[t.id]; else t.folderId = null; } });
        Object.values(this.data.folders).forEach((f) => { if (f.parentId === fid) del(f.id); });
        delete this.data.folders[fid];
        delete this.data.ui.expanded[fid];
      };
      del(id); this.save();
    },
    isExpanded(id) { return this.data.ui.expanded[id] !== false; }, // pastas abertas por padrão
    setExpanded(id, v) { this.data.ui.expanded[id] = v; this.save(); },

    // ---- threads ----
    threadList() { return Object.values(this.data.threads); },
    getThread(id) { return this.data.threads[id]; },
    upsertThread(t) { this.data.threads[t.id] = Object.assign(this.data.threads[t.id] || {}, t); this.save(); },
    favoriteCount() { return this.threadList().filter((t) => t.favorite).length; },
    // move uma thread para outra pasta (ou raiz) e a posiciona antes de `beforeId` (ou no fim)
    moveThread(threadId, targetFolderId, beforeId) {
      const t = this.data.threads[threadId]; if (!t) return;
      t.folderId = targetFolderId || null;
      t.updatedAt = now();
      // recalcula ordem das threads irmãs (mesmo folderId)
      const siblings = this.threadList().filter((x) => x.id !== threadId && (x.folderId || null) === (targetFolderId || null));
      if (beforeId) {
        const idx = siblings.findIndex((x) => x.id === beforeId);
        if (idx >= 0) siblings.splice(idx, 0, t); else siblings.push(t);
      } else {
        siblings.push(t);
      }
      siblings.forEach((x, i) => { x.order = i; });
      if (!siblings.includes(t)) t.order = siblings.length;
      this.save();
    },

    // ---- notes ----
    notesFor(threadId) { return this.data.notes[threadId] || []; },
    upsertNote(n) {
      this.data.notes[n.threadId] = this.data.notes[n.threadId] || [];
      const arr = this.data.notes[n.threadId];
      const i = arr.findIndex((x) => x.clientId === n.clientId);
      if (i >= 0) {
        // merge que NUNCA apaga campos com undefined (o eco do servidor vem sem
        // local/pending — copiar undefined por cima corrompia a nota existente)
        const cur = arr[i];
        const localRx = cur.reactions; // estado local ANTES do merge genérico (base da união)
        const merged = Object.assign({}, cur);
        Object.keys(n).forEach((k) => { if (n[k] !== undefined) merged[k] = n[k]; });
        // reações: mescladas por UNIÃO sobre o estado local ORIGINAL — nem o eco
        // próprio nem a nota de outro usuário podem apagar reações que este device
        // ainda não viu (remoção tem evento próprio, note:reactions)
        if (n.reactions !== undefined && n.reactions && Object.keys(n.reactions).length) {
          const rx = Object.assign({}, localRx || {});
          Object.entries(n.reactions).forEach(([e2, users]) => {
            const set = new Set(rx[e2] || []);
            (users || []).forEach((u) => set.add(u));
            if (set.size) rx[e2] = Array.from(set);
          });
          if (Object.keys(rx).length) merged.reactions = rx;
        }
        arr[i] = merged;
        this.save(); return merged;
      }
      else {
        // guard estrutural anti-double-fire: uma nota NOVA (clientId diferente)
        // com texto longo idêntico da mesma pessoa em <=2.5s não existe em uso
        // real — é disparo duplo/triplo (retry, replay de extensão, evento repetido).
        // Vira merge na existente em vez de inserir a gêmea. Só para texto >=200
        // chars: mensagens curtas legítimas repetidas ("ok", "kkk") continuam passando.
        const norm = (s) => String(s || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
        if (norm(n.text).length >= 200) {
          const twin = arr.find((x) => x.userId === n.userId
            && Math.abs((n.ts || 0) - (x.ts || 0)) <= 2500
            && norm(x.text) === norm(n.text));
          if (twin) { arr.sort((a, b) => (a.sortOrder || a.ts) - (b.sortOrder || b.ts)); this.save(); return twin; }
        }
        arr.push(n);
        arr.sort((a, b) => (a.sortOrder || a.ts) - (b.sortOrder || b.ts));
      }
      // garantir sortOrder em notas antigas
      arr.forEach((x, idx) => { if (x.sortOrder == null) x.sortOrder = idx; });
      const th = this.data.threads[n.threadId];
      if (th) { th.updatedAt = n.ts; th.lastPreview = n.text.slice(0, 60); }
      this.save();
      return n;
    },
    deleteNote(threadId, clientId) {
      if (!this.data.notes[threadId]) return;
      this.data.notes[threadId] = this.data.notes[threadId].filter((x) => x.clientId !== clientId);
      // se a nota pinada foi excluída, limpar pin
      const th = this.data.threads[threadId];
      if (th && th.pinnedId === clientId) th.pinnedId = null;
      this.save();
    },
    // Reações rápidas (❤️ ✨ 🌸 😊 …) — toggle do usuário atual. Formato:
    // note.reactions = { "❤️": [userId, ...], "🌸": [userId, ...] }.
    // Retorna a nota atualizada (ou null se não achou).
    toggleReaction(threadId, clientId, emoji, userId) {
      const arr = this.data.notes[threadId]; if (!arr) return null;
      const n = arr.find((x) => x.clientId === clientId); if (!n) return null;
      const u = userId || this.getUserId();
      // parte do mapa JÁ EXISTENTE (não zera outras reações — sync de reações P0:
      // o objeto chega por referência e era substituído por inteiro)
      const rx = Object.assign({}, n.reactions || {});
      const list = (rx[emoji] || []).slice();
      const i = list.indexOf(u);
      if (i >= 0) { list.splice(i, 1); if (!list.length) delete rx[emoji]; else rx[emoji] = list; }
      else { list.push(u); rx[emoji] = list; }
      if (Object.keys(rx).length) n.reactions = rx; else delete n.reactions;
      this.save();
      return n;
    },
    // reação remota chegando: mescla por USUÁRIO/EMOJI (união). Sem "último vence"
    // por nota — quem reagiu por último envia o mapa completo, mas usuários que
    // reagiram com OUTROS emojis (ou emojis que ainda não chegaram aqui) não somem.
    updateReaction(threadId, clientId, reactions) {
      const arr = this.data.notes[threadId]; if (!arr) return null;
      const n = arr.find((x) => x.clientId === clientId); if (!n) return null;
      const rx = Object.assign({}, n.reactions || {});
      Object.entries(reactions || {}).forEach(([e2, users]) => {
        const set = new Set(rx[e2] || []);
        (users || []).forEach((u) => set.add(u));
        if (set.size) rx[e2] = Array.from(set); else delete rx[e2];
      });
      if (Object.keys(rx).length) n.reactions = rx; else delete n.reactions;
      this.save();
      return n;
    },
    // usuários que saíram do mapa remoto (reagiram e desfizeram em outro device):
    // remove SOMENTE esses pares usuário/emoji e devolve o mapa limpo
    removeReactions(threadId, clientId, reactions) {
      const arr = this.data.notes[threadId]; if (!arr) return null;
      const n = arr.find((x) => x.clientId === clientId); if (!n || !n.reactions) return n;
      Object.entries(reactions || {}).forEach(([e2, users]) => {
        if (!n.reactions[e2]) return;
        const gone = new Set(users || []);
        n.reactions[e2] = n.reactions[e2].filter((u) => !gone.has(u));
        if (!n.reactions[e2].length) delete n.reactions[e2];
      });
      if (!Object.keys(n.reactions).length) delete n.reactions;
      this.save();
      return n;
    },
    // mapa esperado pelo servidor a partir do estado local atual (para sync)
    reactionsOf(threadId, clientId) {
      const arr = this.data.notes[threadId]; if (!arr) return {};
      const n = arr.find((x) => x.clientId === clientId);
      return (n && n.reactions) ? n.reactions : {};
    },
    // cura de duplicatas: notas com texto IDÊNTICO, mesmo autor e timestamps quase
    // iguais (<=2s) são artefatos de double-send (builds antigos reenviavam a nota
    // com client_id novo — o servidor as guarda como notas legítimas). Mantém a mais
    // antiga e retorna a lista das removidas (o chamador sincroniza a exclusão).
    dedupeIdentical(threadId) {
      const arr = this.data.notes[threadId];
      if (!arr || arr.length < 2) return [];
      const kept = new Map();
      const removed = [];
      // normalização fofa de comparação: colapsa whitespace e unifica aspas —
      // gêmeas geradas por replay do Grammarly/retry podem ter espaços ou
      // aspas levemente diferentes, e a comparação exata as deixava passar
      const norm = (s) => String(s || '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim()
        .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
      const key = (n) => (n.userId || '') + '\u0000' + norm(n.text);
      const ord = (n) => (n.sortOrder != null ? n.sortOrder : (n.ts || 0));
      for (const n of arr.slice().sort((a, b) => ord(a) - ord(b))) {
        const prev = kept.get(key(n));
        if (prev && Math.abs((n.ts || 0) - (prev.ts || 0)) <= 2000) { removed.push(n); continue; }
        kept.set(key(n), n);
      }
      if (removed.length) {
        this.data.notes[threadId] = arr.filter((n) => !removed.includes(n));
        this.save();
      }
      return removed;
    },
    editNote(threadId, clientId, newText) {
      const arr = this.data.notes[threadId]; if (!arr) return null;
      const n = arr.find((x) => x.clientId === clientId); if (!n) return null;
      n.text = newText; n.edited = true;
      n.editedAt = Date.now();
      n.rev = (n.rev || 0) + 1; // contador de revisões para desempate de conflito
      const th = this.data.threads[threadId];
      if (th) th.lastPreview = newText.slice(0, 60);
      this.save(); return n;
    },
    setPinned(threadId, clientId) {
      const th = this.data.threads[threadId]; if (!th) return;
      th.pinnedId = (th.pinnedId === clientId) ? null : clientId;
      this.save(); return th.pinnedId;
    },
    setTags(threadId, clientId, tags) {
      const arr = this.data.notes[threadId]; if (!arr) return;
      const n = arr.find((x) => x.clientId === clientId); if (!n) return null;
      n.tags = tags.filter(Boolean).map((t) => t.trim().replace(/^#/, '').slice(0, 24));
      this.save(); return n;
    },
    getPinned(threadId) {
      const th = this.data.threads[threadId]; if (!th || !th.pinnedId) return null;
      const arr = this.data.notes[threadId] || [];
      return arr.find((x) => x.clientId === th.pinnedId) || null;
    },
    reorderNote(threadId, clientId, newIndex) {
      const arr = this.data.notes[threadId]; if (!arr) return;
      const idx = arr.findIndex((x) => x.clientId === clientId); if (idx < 0) return;
      const [n] = arr.splice(idx, 1);
      arr.splice(Math.max(0, Math.min(newIndex, arr.length)), 0, n);
      // reatribuir sortOrder
      arr.forEach((x, i) => { x.sortOrder = i; });
      this.save();
    },
    // Pagina as notas mais antigas que ainda não foram entregues.
    //
    // `beforeKey` é a chave de ordenação (sortOrder quando existe, senão ts) da
    // PRIMEIRA nota já entregue — não um timestamp. O contrato devolve `cursor`:
    // exatamente o valor a passar na próxima chamada. Quem usava `items[0].ts`
    // como âncora quebrava o infinite scroll: o findIndex comparava sortOrder
    // (0,1,2…) contra um timestamp em ms, nunca achava o corte e devolvia a MESMA
    // página com hasMore:true para sempre — o indicador de "Carregando
    // mensagens…" acendia, não trazia nada, e o scroll voltava para o topo.
    pageNotes(threadId, beforeKey, count) {
      // ordem por sortOrder (drag) ou ts (criação) como fallback
      const all = this.notesFor(threadId).slice().sort((a, b) => {
        const ao = a.sortOrder != null ? a.sortOrder : a.ts;
        const bo = b.sortOrder != null ? b.sortOrder : b.ts;
        return ao - bo;
      });
      const ref = all[0] && all[0].sortOrder != null;
      const key = (x) => ref ? x.sortOrder : x.ts;
      // âncora de ordenação da nota, e o ts para a paginação do SUPABASE
      // (.lt('ts')), que é sempre por timestamp mesmo com drag reordenando.
      const anchorOf = (x) => x ? (ref ? x.sortOrder : x.ts) : null;
      // O corte é `>=` e a âncora é a chave da PRIMEIRA nota da página: com
      // esse par a paginação avança sem repetir e sem pular (conferido
      // exaustivamente em tests/store-pagination.test.js, contra as outras
      // três combinações de corte/cursor).
      const idx = beforeKey == null ? all.length : all.findIndex((x) => key(x) >= beforeKey);
      const end = idx < 0 ? all.length : idx;
      const start = Math.max(0, end - count);
      const items = all.slice(start, end);
      return {
        items,
        hasMore: start > 0,
        // âncora da página seguinte: a chave da primeira nota desta página
        cursor: items.length ? anchorOf(items[0]) : beforeKey,
        // ts equivalente, para o fetch do servidor
        oldestTs: items.length ? items[0].ts : null,
      };
    },
  };
