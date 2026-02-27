# OctoSig

**Eight arms. One vault.**

A post-quantum multisignature smart contract vault built on **OPNet** (Bitcoin L2). OctoSig implements an N-of-M owner/threshold model — any transaction requires approval from a minimum number of authorized owners before it can be executed. No single point of failure. No solo key risk.

Built for teams, DAOs, and treasuries that need to manage Bitcoin-native assets collectively.

---

## What Problem Does This Solve?

| Scenario | Single-Key Wallet | OctoSig Vault |
|---|---|---|
| Key loss | All funds gone | Other owners still have access |
| Key theft | Everything stolen | Attacker can't act alone |
| Team treasury | One person holds the keys | All members co-control funds |
| Insider risk | No checks | N-of-M approval required |
| Fat-finger mistake | Irreversible | Others review before execution |

---

## How It Works

OctoSig is a **multisig vault** — a smart contract wallet where multiple owners share control. You choose how many owners the vault has and how many must approve each transaction (the "threshold").

```
Owner A proposes a transaction
        |
Owner B reviews and signs
        |
Owner C reviews and signs
        |
Threshold reached (e.g. 2-of-3) --> Transaction executes on-chain
```

**Hard constraints enforced by the contract:**
- Minimum **3 owners** at all times
- Minimum **threshold of 2** — at least 2 owners must approve every transaction
- No admin backdoor — the owner set governs itself

### Supported Configurations

| Pattern | Meaning |
|---|---|
| **2-of-3** | 2 of 3 owners must approve (minimum valid config) |
| **3-of-3** | All 3 owners required (maximum security, small group) |
| **3-of-5** | 3 of 5 owners required (high-security treasury) |
| **N-of-M** | Fully configurable within the constraints above |

### Supported Assets

| Asset Type | Standard | Description |
|---|---|---|
| **BTC (native)** | — | Bitcoin transferred natively through OPNet |
| **Fungible tokens** | **OP-20** | OPNet's token standard (like ERC-20) |
| **NFTs** | **OP-721** | OPNet's NFT standard (like ERC-721) |

All asset types go through the same N-of-M approval flow.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Platform** | [OPNet](https://opnet.org) — Bitcoin L2 smart contracts |
| **Language** | AssemblyScript (compiled to WASM) |
| **Signing** | Dual-key: secp256k1 (classical) + ML-DSA-44 (post-quantum) |
| **Network** | OPNet Testnet (`https://testnet.opnet.org`) |
| **Runtime** | `@btc-vision/btc-runtime` |
| **Compiler** | AssemblyScript `asc` + `@btc-vision/opnet-transform` |

---

## Project Structure

```
octosig/
├── src/
│   ├── alpha/
│   │   ├── AlphaToken.ts       # OP-20 test token (ALPHA, 1B supply)
│   │   └── index.ts            # OPNet entry point
│   └── beta/
│       ├── BetaToken.ts        # OP-20 test token (BETA, 1B supply)
│       └── index.ts            # OPNet entry point
├── scripts/
│   ├── deploy-alpha.ts         # Deploy AlphaToken to testnet
│   └── deploy-beta.ts          # Deploy BetaToken to testnet
├── build/                      # Compiled WASM binaries
├── abis/                       # Generated ABIs (OP20, OP721)
├── VAULT_DESIGN.md             # Full architecture and interface spec
├── DESIGN_DIRECTIVE.md         # OctoSig neobrutalism design system
├── DEPLOYMENTS.md              # Deployment records (addresses, tx hashes)
└── package.json
```

---

## Roadmap

### Phase 1 — Core Vault (MVP)
The foundation. Setup, execution, owner management, nonce, BTC transfers, events.
- `setup()` — initialize owners + threshold
- `execTransaction()` — signature verification + execution
- Owner management (`addOwner`, `removeOwner`, `changeThreshold`)
- Transaction hash generation for off-chain signing
- Native BTC receive and transfer

### Phase 1.5 — Test Tokens
Two tokens deployed as controlled test assets for integration testing:
- **AlphaToken** (OP-20) — fungible token for testing vault deposits/withdrawals
- **BetaToken** (OP-20) — second test token for multi-asset scenarios

### Phase 2 — Guards
Pre- and post-execution hooks for additional validation:
- Address whitelists, spending limits, time-locks, circuit breakers

### Phase 3 — Modules
Extend the vault without modifying core logic:
- **Allowance Module** — per-owner daily spending limits
- **Recovery Module** — guardian-based account recovery
- **Timelock Module** — delayed execution for sensitive operations

### Phase 4 — Advanced
- Batch transactions (multiple operations in one payload)
- Gas abstraction / relayer support
- Off-chain signature coordination service
- Frontend UI

---

## Testnet Deployments

Both test tokens are live on **OPNet Testnet**:

| Token | Address |
|---|---|
| **AlphaToken** (ALPHA) | `opt1sqrfpr855j4ngqsyyejc00fvheult7s3mjug2pz9n` |
| **BetaToken** (BETA) | `opt1sqpjcuujxqtgawt6ck8qxdw6pue728rkcnghpp084` |

Full deployment details (tx hashes, deployer addresses, WASM sizes) are in [`DEPLOYMENTS.md`](./DEPLOYMENTS.md).

---

## Build & Deploy

**Prerequisites:** Node.js 22+, npm

```bash
# Install dependencies
npm install

# Build all contracts
npm run build

# Build individually
npm run build:alpha
npm run build:beta

# Deploy to OPNet testnet (requires .env with private keys)
npm run deploy:alpha
npm run deploy:beta
```

Deployment requires a `.env` file with your dual-key private key (secp256k1 + ML-DSA-44). See the [OPNet docs](https://opnet.org) for wallet setup.

---

## Design System

OctoSig uses a **neobrutalism** design language — thick borders, hard shadows, flat saturated colors, bold typography. The visual identity is built around the octopus mascot and a deep-sea color palette.

Full design spec is in [`DESIGN_DIRECTIVE.md`](./DESIGN_DIRECTIVE.md).

**Brand colors:**

| Color | Hex | Usage |
|---|---|---|
| Deep Ocean Blue | `#2D3AFF` | Primary brand, buttons, active states |
| Coral Orange | `#FF6B35` | Secondary actions, notifications |
| Bioluminescent Teal | `#4ECDC4` | Info states, highlights |
| Ink Purple | `#7B2FBE` | Ink splatter motifs, signature confirmations |
| Bitcoin Gold | `#F5A623` | BTC amounts, vault balances |

---

## Security Model

- **No admin backdoor** — all management operations go through `execTransaction` with threshold approval
- **Replay protection** — nonce included in every transaction hash, incremented atomically
- **Signature deduplication** — same owner signing twice does not count as two approvals
- **Reentrancy protection** — nonce marked as used before external calls
- **Post-quantum signing** — ML-DSA-44 (FIPS 204) alongside classical secp256k1
- **EIP-712 structured signing** — domain separation prevents cross-vault and cross-network replay

---

## Documentation

| Document | Description |
|---|---|
| [`VAULT_DESIGN.md`](./VAULT_DESIGN.md) | Full architecture, interface spec, signature scheme, and phased roadmap |
| [`DESIGN_DIRECTIVE.md`](./DESIGN_DIRECTIVE.md) | OctoSig neobrutalism design system and brand identity |
| [`DEPLOYMENTS.md`](./DEPLOYMENTS.md) | Deployment records with contract addresses and transaction hashes |

---

## License

TBD
