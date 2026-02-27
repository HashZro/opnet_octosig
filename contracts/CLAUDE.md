# Claude Code Instructions — MultSig Vault on OPNet

## MCP: OPNet Bob (Required)

This project is built on OPNet. **Always consult Bob — the official OPNet AI assistant — via MCP before answering questions about OPNet APIs, contract patterns, package versions, or protocol behaviour.**

### Setup

```bash
claude mcp add opnet-bob --transport http https://ai.opnet.org/mcp
```

Bob provides up-to-date knowledge of:
- OPNet smart contract patterns and AssemblyScript conventions
- Correct package versions (`@btc-vision/btc-runtime`, `@btc-vision/transaction`, `opnet`, etc.)
- OP-20 / OP-721 token standards
- Deployment, signing, and UTXO mechanics
- OPNet RPC endpoints and network configuration

**Do not guess OPNet-specific behaviour — ask Bob first.**

---

## Project Overview

A post-quantum multisignature smart contract vault on OPNet (Bitcoin L2). Implements an N-of-M owner/threshold model: any transaction requires approval from a minimum number of authorized owners before execution.

See `VAULT_DESIGN.md` for the full architecture, phased roadmap, and interface spec.

---

## Key Conventions

- **Language**: AssemblyScript (compiled to WASM via `asc`)
- **Entry point pattern**: `Blockchain.contract = () => new MyContract()` + `export * from '@btc-vision/btc-runtime/runtime/exports'`
- **Transform**: `@btc-vision/opnet-transform` (set in `asconfig.json`)
- **Network**: OPNet Testnet (`https://testnet.opnet.org`) — addresses use the `opt` bech32 HRP
- **Signing**: dual-key — secp256k1 (classical) + ML-DSA-44 (post-quantum, LEVEL2)
- **Keys**: stored in `.env` as `EC_PRIVATE_KEY` (64 hex) and `MLDSA_PRIVATE_KEY` (5120 hex) — never commit

## Build & Deploy

```bash
npm run build        # compile WASM
npm run deploy:alpha # deploy AlphaToken to OPNet testnet
```
