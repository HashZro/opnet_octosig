# OPNet Testnet Deployment Notes & Lessons Learned

## Deployment History

### OctToken (OCT) — Successfully Deployed
- **Contract Address:** `opt1sqqlnq2fg3lfcpdfrz25mmwkvvnvm2yca0vnw7use`
- **Contract Pubkey:** `0xd11fda6c6fdb0761d2e29361c8f6d47264cd595b00462c30dcf4db9dda7cd48e`
- **Deploy Tx:** `223bd14af9c0d5a07a1830c3f6f0a67baad946ca1bab6fb801e74bc0e170ff08`
- **Block:** #2,303
- **btc-runtime version:** 1.11.0-rc.10

### AlphaToken / BetaToken — INVALIDATED
- Deployed on the old testnet chain (pre v1.0.0-testnet release)
- Chain was reset on 2026-02-26 — all old contracts ceased to exist
- "Contract not found" errors on RPC calls

---

## Mistakes & Fixes

### 1. "Unknown chain id" Revert
**Problem:** `@btc-vision/btc-runtime` version 1.11.0-rc.4 does not recognize the OPNet testnet chain ID. The WASM contract reverts at `Networks.ts:82` during `onDeployment()`.

**Fix:** Upgrade to `@btc-vision/btc-runtime` >= 1.11.0-rc.10, which adds `Networks.OpnetTestnet = 3` with the `opt` bech32 HRP and the correct genesis block hash.

**Lesson:** When a new network launches (like OPNet testnet v1.0.0), always check if the smart contract runtime library supports that network's chain ID. Update dependencies BEFORE deploying.

### 2. "No ML-DSA public key linked to the legacy address" Revert
**Problem:** Deploying a contract requires the wallet's ML-DSA (post-quantum) public key to be registered on OPNet's consensus layer. Plain Bitcoin sends do NOT register it.

**Fix:** Make at least one OPNet-aware transaction from OPWallet first (e.g., interact with a contract, swap on MotoSwap). This embeds the ML-DSA public key in the transaction metadata and links it on-chain.

**Lesson:** Before deploying from a new wallet, always verify the ML-DSA key is linked. Check OPScan — the address should show "X linked" (not "0 linked").

### 3. "Out of gas" Revert (consumed: 330000000)
**Problem:** Contract deployment used `GAS_SAT_FEE = 330n` (330 satoshis), which only provided 330,000,000 gas units — not enough for deploying a WASM contract.

**Fix:** Increased `GAS_SAT_FEE` to `10_000n` (10,000 satoshis), providing ~10 billion gas units.

**Lesson:** Contract deployments are gas-heavy because the entire WASM bytecode must be processed. Use at least 10,000 sat for `gasSatFee` when deploying. Regular contract interactions (function calls) can use less.

### 4. "No UTXOs found" — Funds Locked in CSV
**Problem:** After a MotoSwap, ALL BTC (including change) goes into CSV-timelocked addresses. The deploy script only looks for UTXOs on P2TR and P2WPKH addresses, which are now empty.

**Fix:** Wait for CSV timelock to expire, or get fresh tBTC from the faucet.

**Lesson:** CSV (CheckSequenceVerify) timelocks are a safety mechanism in OPNet swaps. After a swap, your change is temporarily locked for several blocks. Always keep some BTC in a separate UTXO that you don't use for swaps, so you have spendable funds for deployments and interactions.

---

## Deployment Checklist

Before deploying a contract to OPNet testnet:

1. **Check btc-runtime version** — must be >= 1.11.0-rc.10 for OPNet testnet
2. **Verify ML-DSA key is linked** — make an OPNet tx from OPWallet first if it's a new wallet
3. **Ensure spendable UTXOs exist** — check that your P2TR address has non-CSV UTXOs
4. **Set adequate gas** — use `GAS_SAT_FEE = 10_000n` or higher for deployments
5. **Build fresh WASM** — always `npm run build:<target>` before deploying after dependency updates
6. **Verify on OPScan** — check the deploy tx for errors; "Not Finalized" is OK, "Reverted" is not

---

## Config Reference

```typescript
// deploy script config that works for OPNet testnet
const NODE_URL     = 'https://testnet.opnet.org';
const NETWORK      = networks.testnet;
const OPNET_NETWORK = { ...NETWORK, bech32: NETWORK.bech32Opnet! };
const FEE_RATE     = 50;        // sat/vbyte
const PRIORITY_FEE = 0n;
const GAS_SAT_FEE  = 10_000n;   // 10k sat — enough for contract deployment
```
