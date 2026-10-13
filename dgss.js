'use strict';

const crypto = require('crypto');

/**
 * ======== PARAMETERS (use larger primes in real deployment) ========
 * For demo we generate random small safe-prime groups per key generation.
 * In a real deployment, replace this with validated 256-bit safe primes.
 */
function isPrime(n) {
  n = BigInt(n);
  if (n < 2n) return false;
  if (n % 2n === 0n) return n === 2n;
  for (let i = 3n; i * i <= n; i += 2n) {
    if (n % i === 0n) return false;
  }
  return true;
}

function findRandomSafePrime() {
  const smallQCandidates = [11n, 23n, 29n, 41n, 47n, 59n, 71n, 83n, 107n, 109n, 113n, 127n];
  const candidates = smallQCandidates
    .map((q) => ({ q, p: 2n * q + 1n }))
    .filter(({ p }) => isPrime(p));

  if (candidates.length === 0) {
    throw new Error('Unable to generate safe prime parameters for demo.');
  }

  const choice = candidates[Math.floor(Math.random() * candidates.length)];
  return choice;
}

function findGenerator(p, q) {
  for (let g = 2n; g < p - 1n; g += 1n) {
    if (modExp(g, q, p) === 1n && modExp(g, 2n, p) !== 1n) {
      return g;
    }
  }
  throw new Error('Unable to find a generator for the selected safe prime.');
}

function randomParams() {
  const { p, q } = findRandomSafePrime();
  return {
    p,
    q,
    g: findGenerator(p, q),
  };
}

const PARAMS = randomParams();

function getParams(params) {
  return params && params.p && params.q && params.g ? params : PARAMS;
}

/** ======== HELPERS ======== **/

// Ensure positive mod in [0, m-1]
function mod(a, m) {
  a = BigInt(a);
  m = BigInt(m);
  const r = a % m;
  return r >= 0n ? r : r + m;
}

// Fast modular exponentiation (BigInt)
function modExp(base, exp, modn) {
  base = BigInt(base);
  exp = BigInt(exp);
  modn = BigInt(modn);
  let result = 1n;
  let b = mod(base, modn);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = (result * b) % modn;
    e >>= 1n;
    b = (b * b) % modn;
  }
  return result;
}

// Cryptographically secure random BigInt in [1, q-1]
function randQ(params = PARAMS) {
  params = getParams(params);
  const buf = crypto.randomBytes(8);
  const n = BigInt('0x' + buf.toString('hex'));
  return mod(n, params.q - 1n) + 1n;
}

// Hash to Z_q
function hashToQ(inputs, params = PARAMS) {
  params = getParams(params);
  if (!Array.isArray(inputs)) inputs = [inputs];
  const h = crypto.createHash('sha256');
  for (const x of inputs) {
    if (typeof x === 'bigint') h.update(x.toString());
    else if (typeof x === 'string') h.update(x);
    else h.update(JSON.stringify(x));
  }
  const digest = h.digest('hex');
  return BigInt('0x' + digest) % params.q;
}

// Hash to Z_p. The paper signs M = Mcheck || Moriginal; for this
// JavaScript demo we map that concatenated message into the field.
function hashToP(inputs, params = PARAMS) {
  params = getParams(params);
  if (!Array.isArray(inputs)) inputs = [inputs];
  const h = crypto.createHash('sha256');
  for (const x of inputs) {
    if (typeof x === 'bigint') h.update(x.toString());
    else if (typeof x === 'string') h.update(x);
    else h.update(JSON.stringify(x));
  }
  const digest = h.digest('hex');
  return BigInt('0x' + digest) % params.p;
}

function makeMcheck(message, bits = 8) {
  const digest = crypto.createHash('sha256').update(String(message)).digest();
  const neededBytes = Math.ceil(bits / 8);
  return digest
    .subarray(0, neededBytes)
    .toString('hex')
    .slice(0, Math.ceil(bits / 4));
}

function messageToField(mcheck, originalMessage, params = PARAMS) {
  return hashToP(`${mcheck}|${String(originalMessage)}`, params);
}

// Safe JSON conversion (BigInt -> string)
function toJSONSafe(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v
  ));
}

// Parse BigInt fields from JSON (strings -> BigInt)
function fromJSONBigInt(obj) {
  const bigintKeys = new Set([
    'x', 'y', 'r', 's', 'RN', 'k', 'R', 'S', 'RN_total', 'k_sum',
    'A', 'B', 'C', 'D', 'p', 'q', 'g', 'recovered', 'expected'
  ]);

  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(fromJSONBigInt);

  const out = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (bigintKeys.has(k) && typeof v === 'string' && /^\d+$/.test(v)) {
      out[k] = BigInt(v);
    } else if (typeof v === 'object' && v !== null) {
      out[k] = fromJSONBigInt(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** ======== CORE DGSS ======== **/
/**
 * Key Generation
 * Returns { params, x, y }
 */
function keygen(params = randomParams()) {
  params = getParams(params);
  const { p, g } = params;
  const x = randQ(params);                // secret
  const y = modExp(g, x, p);              // public
  return { params, x, y };
}
/**
 * Registration Manager issues one certificate share
 * Input: user public key yi, RM secret xRM
 * Output: { r_ij, s_ij, RN_ij, k_ij }
 */
function rmIssue(yi, xRM, params = PARAMS) {
  params = getParams(params);
  const { p, q } = params;

  // choose k_ij s.t. gcd(k_ij, q) = 1 (q prime -> any non-zero works)
  let k = randQ(params);
  if (k === 0n) k = 1n;

  const RN = randQ(params);

  // r_ij = (yi * k - xRM) mod q
  const r = mod(yi * k - xRM, q);

  // s_ij = yi^{k} mod p
  const s = modExp(yi, k, p);

  return { r, s, RN, k };
}

/**
 * Aggregate certificate shares
 * Input: list of {r,s,RN,k}
 * Output: { R, S, RN_total, k_sum }
 */
function aggregateCert(shares, params = PARAMS) {
  params = getParams(params);
  const { p, q } = params;

  let R = 0n;
  let S = 1n;
  let RN_total = 0n;
  let k_sum = 0n;

  for (const sh of shares) {
    R = mod(R + BigInt(sh.r), q);
    S = mod(S * BigInt(sh.s), p);
    RN_total += BigInt(sh.RN);
    k_sum += BigInt(sh.k);
  }
  return { R, S, RN_total, k_sum };
}

/**
 * Verify aggregated certificate
 * Checks: S^{y} ?= (g^{R} * Π y_RM)^{x}
 * Input: user {x,y,params}, aggregated {R,S}, array of RM public keys [y_RM...]
 */
function verifyCert(user, agg, yRM_list, params = user?.params) {
  params = getParams(params);
  const { p, g } = params;
  const { x, y } = user;
  const { R, S } = agg;

  // Left = S^{y} mod p
  const left = modExp(S, y, p);

  // Compute Π y_RM
  let yRM_prod = 1n;
  for (const yrm of yRM_list) yRM_prod = (yRM_prod * BigInt(yrm)) % p;

  // Right = (g^R * Π y_RM)^{x} mod p
  const base = mod((modExp(g, R, p) * yRM_prod) % p, p);
  const right = modExp(base, x, p);

  return left === right;
}

/**
 * Sign (DGSS)
 * Inputs:
 *  - user: {x,y}
 *  - cert: {R,S}
 *  - receiverY (e.g., AM public key)
 *  - message M (number or string)
 * Output: {A,B,C,D}
 */
function sign(user, cert, receiverY, originalMessage, options = {}, params = user?.params) {
  params = getParams(params);
  const { p, q } = params;

  const x = BigInt(user.x);
  const y = BigInt(user.y);

  const R = BigInt(cert.R);
  const S = BigInt(cert.S);

  receiverY = BigInt(receiverY);

  const Mcheck = options.Mcheck || options.mcheck || makeMcheck(originalMessage);
  const M = messageToField(Mcheck, originalMessage, params);

  const N1 = randQ(params);
  const N2 = randQ(params);

  // A = x * N1 * N2 mod q
  const A = mod(x * N1 * N2, q);

  // B = S^{N1*N2*y} mod p
  const B = modExp(S, N1 * N2 * y, p);

  const hB = hashToQ([B], params);

  // C = M * y_AM^{-N1*A*h(B)} mod p
  // exponent mod q (using Fermat-like reduction for demo)
  const exp = mod(q - mod(N1 * A * hB, q), q);
  const invTerm = modExp(receiverY, exp, p);
  const C = mod(M * invTerm, p);

  const hC = hashToQ([C], params);

  // D = N1 - R*h(C) mod q
  const D = mod(N1 - R * hC, q);

  return { A, B, C, D, Mcheck };
}

/**
 * Verify (DGSS)
 * Input:
 *  - sig {A,B,C,D,Mcheck}
 *  - receiverX (AM private key)
 *  - yRM_list registration manager public keys
 *  - originalMessage message to test against Mcheck || Moriginal
 * Output:
 *  - { valid, recovered, expected, Mcheck }
 */
function verify(sig, receiverX, yRM_list = [], originalMessage = null, params = PARAMS) {
  params = getParams(params);
  const { p, q, g } = params;
  const { A, B, C, D } = sig;

  const hB = hashToQ([B], params);
  const hC = hashToQ([C], params);

  let yRM_prod = 1n;
  for (const yrm of yRM_list) {
    yRM_prod = mod(yRM_prod * BigInt(yrm), p);
  }

  // Paper Eq. (10):
  // M = C * [g^(D*A) * product(y'_j)^(-h(C)*A) * B^h(C)]^(x_l*h(B)) mod p
  const rmCancel = modExp(
    yRM_prod,
    mod(q - mod(hC * A, q), q),
    p
  );

  const term = mod(
    modExp(g, D * A, p) *
    rmCancel *
    modExp(B, hC, p),
    p
  );

  // M = C * term^{x_AM * h(B)} mod p
  const recovered = mod(C * modExp(term, BigInt(receiverX) * hB, p), p);

  if (originalMessage === null || originalMessage === undefined) {
    return {
      valid: true,
      recovered,
      expected: null,
      Mcheck: sig.Mcheck
    };
  }

  const expectedMcheck = makeMcheck(originalMessage);
  const expected = messageToField(sig.Mcheck, originalMessage, params);

  return {
    valid: recovered === expected && sig.Mcheck === expectedMcheck,
    recovered,
    expected,
    Mcheck: sig.Mcheck,
    expectedMcheck
  };
}

/**
 * Identify (threshold-style simplified)
 * Input:
 *  - sig {A,B,...}
 *  - candidates: array of { id, y, k_sum }
 * Output:
 *  - id or null
 */
function identify(sig, candidates, params = PARAMS) {
  params = getParams(params);
  const { p, g } = params;
  const { A, B } = sig;

  for (const c of candidates) {
    const y = BigInt(c.y);
    const ksum = BigInt(c.k_sum);

    // test: g^{A * k_sum * y} ?= B
    const test = modExp(g, A * ksum * y, p);
    if (test === B) return c.id;
  }
  return null;
}

/** ======== EXPORTS ======== **/

module.exports = {
  PARAMS,
  // helpers
  modExp,
  hashToQ,
  hashToP,
  makeMcheck,
  messageToField,
  toJSONSafe,
  fromJSONBigInt,
  // dgss
  keygen,
  rmIssue,
  aggregateCert,
  verifyCert,
  sign,
  verify,
  identify,
};
