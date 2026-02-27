# MultSig Vault — Deployment Records

---

## OPNet Testnet — AlphaToken v4 (OP-20) ← ACTIVE

| Field | Value |
|---|---|
| **Date** | 2026-02-25 |
| **Network** | OPNet Testnet |
| **RPC Endpoint** | https://testnet.opnet.org |
| **Contract** | AlphaToken (ALPHA) — OP-20 token, 1B supply, mine() function |
| **Contract Address** | `opt1sqrfpr855j4ngqsyyejc00fvheult7s3mjug2pz9n` |
| **Contract PubKey** | `0xc71bac0f94e02b8ed8bb68111ab98586bc44a6e8d4b8d48a714354eb80dda1c8` |
| **mine() selector** | `0x417c69bb` |
| **Funding Tx** | `26cfa4c097e5a87541e05e948a7b797d10cdd01c4f8854542dd6a7a1c51bd1cd` |
| **Deploy Tx** | `c67b9360864d4ac15e3fa1a5115d9003f5e06e61fbf575c34f6dc8910b7df03b` |
| **WASM size** | 35,297 bytes |
| **Deployer (p2tr)** | `opt1pr55ynlpcvfqm40kv5m4743th37xach304jvzzzcyq632qj9w53tqvzmf5k` |
| **Deployer (p2wpkh)** | `opt1qm57tmmyj3fw95j56fj2qqge6uwv65w2hut5dgp` |

---

## OPNet Testnet — BetaToken v4 (OP-20) ← ACTIVE

| Field | Value |
|---|---|
| **Date** | 2026-02-25 |
| **Network** | OPNet Testnet |
| **RPC Endpoint** | https://testnet.opnet.org |
| **Contract** | BetaToken (BETA) — OP-20 token, 1B supply, mine() function |
| **Contract Address** | `opt1sqpjcuujxqtgawt6ck8qxdw6pue728rkcnghpp084` |
| **Contract PubKey** | `0xc372eaa42f9f3be060b5ef266378c46ff45990becd0369f4e7751fb38913aa77` |
| **mine() selector** | `0x417c69bb` |
| **Funding Tx** | `99d83e6f1ad6bfbfe1a3f1f4d1e74863a2ff9425fe65e6c129593779f6ce1ec0` |
| **Deploy Tx** | `f43dce4a6777b01946c62c5149aab6f774357f7f1c1265862a2c0b9cf19dd3b6` |
| **WASM size** | 35,289 bytes |
| **Deployer (p2tr)** | `opt1pr55ynlpcvfqm40kv5m4743th37xach304jvzzzcyq632qj9w53tqvzmf5k` |
| **Deployer (p2wpkh)** | `opt1qm57tmmyj3fw95j56fj2qqge6uwv65w2hut5dgp` |

---

## Superseded Deployments

| Contract | Address | Notes |
|---|---|---|
| AlphaToken v1 | `opt1sqp2m9wyc759rxucgnjq02l78yrh4ylaypyhx4j48` | No mine() |
| BetaToken v1 | `opt1sqzjpdemrpyuapuhwky72s270j0ddgjzyfcn7m4xk` | No mine() |
| AlphaToken v2 | `opt1sqq0k32mjtxlhlsvwfn7awevg2h3vamaxrvhtz5th` | Deploy tx never confirmed |
| BetaToken v2 | `opt1sqrlu3rjls5eu49jkhed3z32t2ptf4jdxt5c0hnn5` | Deploy tx never confirmed |
| AlphaToken v3 | `opt1sqrfjaegty67hjsp454halqkr2nxa0f6tnydz3kxc` | Lost in testnet reset |
| BetaToken v3 | `opt1sqq697v6kk9hhtvnvxv543hvm35sxyjez7uwrr6h6` | Lost in testnet reset |

---

## Key Technical Notes

- OPNet testnet indexes addresses with the `opt` bech32 HRP, not the standard Bitcoin `tb` prefix.
  The underlying witness program is identical — only the HRP and checksum differ.
- Deployment requires two broadcast transactions: a **funding tx** first, then the **deploy tx**
  (the deploy tx spends the output of the funding tx).
- The deployer wallet uses dual keys: secp256k1 (classical) + ML-DSA-44 (post-quantum).
- MLDSA key size on OPNet: 2560 bytes / 5120 hex chars (32 bytes larger than NIST FIPS 204 standard).
- Fee rate for v2 deployments: 50 sat/vbyte.
- `mine()` selector: `0x417c69bb` (same for both tokens — derived from the function signature `mine()`).
- `mine()` requires ≥1000 sat (0.00001 BTC) sent to the contract address in the same transaction.
  Contract verifies via `tx.outputs` `scriptPublicKey` byte comparison.
- `mine()` mints 100 tokens (100 × 10^18 raw units) to the caller.
- Deployer pre-mint: 10,000,000 tokens each (for testing); remaining 990,000,000 are mineable.
