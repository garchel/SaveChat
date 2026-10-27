import {
  PBKDF2_ITERATIONS,
  randomSalt,
  deriveKek,
  generateDek,
  wrapDek,
  unwrapDek,
  generateRecoveryCode,
  deriveRecoveryKey,
} from './crypto.js';

export const KEY_VERSION = 1;
export const KDF = 'PBKDF2-SHA256';

function iterationsOf(bundle) {
  const n = Number(bundle && bundle.kdf_iterations);
  return Number.isFinite(n) && n >= 1 ? n : PBKDF2_ITERATIONS;
}

export async function createKeys(passphrase, { iterations = PBKDF2_ITERATIONS } = {}) {
  const salt = randomSalt();
  const kek = await deriveKek(passphrase, salt, iterations);
  const dek = await generateDek();
  const wrapped = await wrapDek(dek, kek);

  const recoveryCode = generateRecoveryCode();
  const recoveryKek = await deriveRecoveryKey(recoveryCode);
  const recoveryWrapped = await wrapDek(dek, recoveryKek);

  return {
    bundle: {
      version: KEY_VERSION,
      salt,
      kdf: KDF,
      kdf_iterations: iterations,
      wrapped_dek: wrapped,
      recovery_wrapped_dek: recoveryWrapped,
    },
    dek,
    recoveryCode,
  };
}

export async function unlockWithPassword(bundle, passphrase) {
  if (!bundle || !bundle.salt || !bundle.wrapped_dek) throw new Error('Chaves de criptografia ausentes.');
  const kek = await deriveKek(passphrase, bundle.salt, iterationsOf(bundle));
  return unwrapDek(bundle.wrapped_dek, kek);
}

export async function unlockWithRecovery(bundle, recoveryCode) {
  if (!bundle || !bundle.recovery_wrapped_dek) throw new Error('Código de recuperação não configurado.');
  const kek = await deriveRecoveryKey(recoveryCode);
  return unwrapDek(bundle.recovery_wrapped_dek, kek);
}

export function formatRecoveryCode(code) {
  return String(code || '').replace(/(.{4})/g, '$1 ').trim();
}
