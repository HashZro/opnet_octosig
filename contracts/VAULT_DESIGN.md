# MultSig Vault — Design Document

> **Target platform**: OPNet (Bitcoin L2 smart contracts)
> **Last updated**: 2026-02-25

---

## 1. What This Project Is

A **MultSig Vault** is a smart contract wallet that requires multiple authorized parties (owners) to approve any transaction before it is executed. This eliminates the single point of failure inherent in traditional single-key wallets.

This vault implements a battle-tested N-of-M ownership and approval model in OPNet's smart contract environment, eliminating single points of failure for teams, DAOs, and treasuries managing Bitcoin-native assets.

---

## 2. Why MultSig?

| Problem | Single-Key Wallet | MultSig Vault |
|---|---|---|
| Key loss | All funds lost | Other owners still have access |
| Key theft | All funds stolen | Attacker can't act alone |
| Team treasury | One person holds everything | All members co-control funds |
| Insider risk | No checks | N-of-M approval required |
| Operational errors | Irreversible | Others can review before execution |

---

## 3. Core Concepts

### 3.1 Owners
- An owner is an authorized account that can sign/approve transactions
- In OPNet: owners are Bitcoin addresses / OPNet wallet addresses
- Owners can be added or removed by the existing owner set (requires threshold approval)

### 3.2 Threshold
The minimum number of owner signatures required to execute a transaction.

**Hard constraints (enforced by the contract):**
- Minimum **3 owners** at all times
- Minimum **threshold of 2** — at least 2 owners must approve every transaction

Supported patterns:
| Pattern | Meaning |
|---|---|
| **2-of-3** | 2 of 3 owners must approve (minimum valid configuration) |
| **3-of-3** | All 3 owners required (maximum security for small group) |
| **3-of-5** | 3 of 5 owners required (high-security treasury) |
| **N-of-M** | Fully configurable, subject to min-owners=3 and min-threshold=2 |

### 3.3 Transaction Lifecycle

```
Owner A proposes tx ──→ Owners B & C review and sign ──→ Threshold reached ──→ Execution
     │                         │                                  │                 │
  (off-chain)             (off-chain)                      (on-chain submit)   (contract runs)
```

1. Any owner (or anyone) **proposes** a transaction (to address, value, calldata)
2. Owners collect **signatures** — each owner signs the transaction hash
3. Once the number of valid signatures ≥ threshold, the transaction is **executable**
4. Any account submits the final transaction on-chain, triggering `execTransaction`
5. The contract verifies all signatures and executes if valid

### 3.3 Supported Assets

The vault is designed to hold and transfer three categories of assets:

| Asset Type | Standard | Description |
|---|---|---|
| **BTC (native)** | — | Bitcoin transferred natively through OPNet; no contract wrapping required |
| **Fungible tokens** | **OP-20** | OPNet's fungible token standard (analogous to ERC-20); arbitrary amounts, divisible |
| **Non-fungible tokens** | **OP-721** | OPNet's NFT standard (analogous to ERC-721); unique token IDs, indivisible |

Each asset type requires its own transfer logic within the vault's execution layer, but all transfers are gated by the same N-of-M approval flow.

### 3.4 Nonce
- Each transaction includes a **nonce** to prevent replay attacks
- The vault maintains an internal nonce counter that increments after every executed transaction
- Prevents the same signed transaction from being submitted twice

---

## 4. Architecture

A **Proxy + Singleton** pattern is used:
- One master contract (singleton) holds all logic
- Each deployed vault is a lightweight proxy pointing to the singleton
- Each proxy has its own independent state (owners, threshold, nonce, balances)
- Reduces deployment cost significantly

### OPNet Adaptation

OPNet contracts are deployed per-instance, so the singleton/proxy pattern may or may not apply depending on OPNet's deployment model. The core logic remains the same regardless.

**Core contract components:**

```
┌─────────────────────────────────────────┐
│              MultSig Vault              │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │OwnerManager │  │  ModuleManager   │  │
│  │             │  │  (optional/v2)   │  │
│  │ - owners[]  │  │  - modules[]     │  │
│  │ - threshold │  │  - enableModule  │  │
│  │ - addOwner  │  │  - execFromMod   │  │
│  │ - removeOwner│  └──────────────────┘  │
│  └─────────────┘                        │
│                                         │
│  ┌─────────────┐  ┌──────────────────┐  │
│  │   Executor  │  │  GuardManager    │  │
│  │             │  │  (optional/v2)   │  │
│  │ - execTx    │  │  - pre-check     │  │
│  │ - call      │  │  - post-check    │  │
│  │ - delegatecall│ └──────────────────┘  │
│  └─────────────┘                        │
│                                         │
│  nonce: u64                             │
│  owners: Address[]                      │
│  threshold: u8                          │
└─────────────────────────────────────────┘
```

---

## 5. Smart Contract Interface

### 5.1 State

```typescript
// Core state
owners: Map<Address, bool>         // registered owner addresses
ownerList: Address[]               // ordered list for iteration
threshold: u8                      // min signatures required (≥ 2)
nonce: u64                         // replay protection counter

// Asset tracking
btcBalance: u256                   // native BTC held by the vault
op20Balances: Map<Address, u256>   // token contract → vault's balance
op721Holdings: Map<Address, u256[]> // NFT contract → list of token IDs held
```

### 5.2 Core Functions

#### `setup(owners: Address[], threshold: u8)`
- Called once on deployment to initialize the vault
- Sets the initial owner list and threshold
- **`owners.length` must be ≥ 3** — fewer than 3 owners is rejected
- **`threshold` must be ≥ 2** and ≤ `owners.length`
- Cannot be called again after initialization

#### `execTransaction(to, value, data, signatures)`
- The central execution function
- Parameters:
  - `to` — destination address
  - `value` — rBTC / satoshis to send
  - `data` — calldata for contract interaction (empty for plain transfers)
  - `signatures` — concatenated owner signatures
- Flow:
  1. Compute the transaction hash (includes nonce, chainId, vault address)
  2. Recover signer addresses from each signature
  3. Verify each signer is a registered owner
  4. Count valid unique signers — must meet threshold
  5. Increment nonce
  6. Execute the transaction
  7. Emit `ExecutionSuccess` or `ExecutionFailure` event

#### `addOwner(newOwner: Address, newThreshold: u8)`
- Adds a new owner to the vault
- Must be called via `execTransaction` (requires existing owners' approval)
- Optionally updates the threshold

#### `removeOwner(prevOwner: Address, owner: Address, newThreshold: u8)`
- Removes an existing owner
- Must be called via `execTransaction`
- Uses linked-list pointer for gas efficiency
- **Reverts if removal would drop the owner count below 3**
- **`newThreshold` must remain ≥ 2** after the removal

#### `changeThreshold(newThreshold: u8)`
- Updates the minimum required signatures
- Must be called via `execTransaction`
- **`newThreshold` must be ≥ 2** and ≤ current owner count

#### `getTransactionHash(to, value, data, nonce) → bytes32`
- Pure function — returns the hash that owners must sign
- Used off-chain by signers to generate their signatures
- Includes EIP-712-style domain separation (chainId + contract address)

### 5.3 Asset Transfer Functions

These are called internally during `execTransaction` based on the decoded `data` payload. They are not directly callable from outside the vault.

#### `transferBTC(to: Address, amount: u256)`
- Sends native BTC from the vault to a recipient
- Requires threshold approval via `execTransaction`

#### `transferOP20(token: Address, to: Address, amount: u256)`
- Calls `transfer(to, amount)` on the given OP-20 token contract
- Requires threshold approval via `execTransaction`

#### `transferOP721(token: Address, to: Address, tokenId: u256)`
- Calls `transferFrom(vault, to, tokenId)` on the given OP-721 contract
- Requires threshold approval via `execTransaction`

### 5.4 View Functions

```typescript
getOwners(): Address[]
isOwner(address: Address): bool
getThreshold(): u8
getNonce(): u64
getBTCBalance(): u256
getOP20Balance(token: Address): u256
getOP721Holdings(token: Address): u256[]
```

### 5.5 Events

```typescript
event ExecutionSuccess(txHash: bytes32, payment: u256)
event ExecutionFailure(txHash: bytes32, payment: u256)
event AddedOwner(owner: Address)
event RemovedOwner(owner: Address)
event ChangedThreshold(threshold: u8)

// Asset events
event ReceivedBTC(from: Address, amount: u256)
event TransferredBTC(to: Address, amount: u256)
event ReceivedOP20(token: Address, from: Address, amount: u256)
event TransferredOP20(token: Address, to: Address, amount: u256)
event ReceivedOP721(token: Address, from: Address, tokenId: u256)
event TransferredOP721(token: Address, to: Address, tokenId: u256)

event EnabledModule(module: Address)      // v2
event DisabledModule(module: Address)     // v2
```

---

## 6. Signature Scheme

### Transaction Hash Construction

The transaction hash is what each owner signs. It must include:
- Vault contract address (prevents cross-vault replay)
- Chain / network identifier (prevents cross-network replay)
- Current nonce (prevents replay of old transactions)
- Transaction parameters: `to`, `value`, `data`

```
txHash = hash(
  "\x19\x01",
  domainSeparator(chainId, vaultAddress),
  hash(
    SAFE_TX_TYPEHASH,
    to,
    value,
    keccak256(data),
    nonce
  )
)
```

This follows the **EIP-712** structured data signing standard.

### Signature Types

| Type | Description |
|---|---|
| **ECDSA** | Standard secp256k1 signature from EOA (r, s, v) |
| **Contract signature** | Owner is a smart contract; ERC-1271 `isValidSignature` called |
| **Pre-approved** | Owner already called `approveHash` on-chain; no extra sig needed |

For OPNet v1, ECDSA signatures from owner wallets are the primary mechanism. Contract signatures and pre-approval can be added in v2.

### Signature Packing

Signatures are concatenated and passed as a single bytes blob:

```
signatures = sig1 (65 bytes) + sig2 (65 bytes) + ... + sigN (65 bytes)
```

Each signature = `r (32 bytes) || s (32 bytes) || v (1 byte)`

The contract recovers the signer from each 65-byte chunk and validates against the owner set.

---

## 7. Security Model

### Access Control Rules
- Only the vault itself can call owner management functions (add/remove owner, change threshold)
- This means all management operations MUST go through `execTransaction` with threshold approval
- No admin backdoor — the owner set is self-governing

### Replay Protection
- Nonce is included in every transaction hash
- Nonce is incremented atomically on every successful execution
- If execution fails, nonce still increments (to invalidate already-signed transactions)

### Signature Deduplication
- The same owner signing twice must not count as two approvals
- Contract must deduplicate signers before counting

### Reentrancy
- The vault must be protected against reentrancy during execution
- Mark nonce as "used" before external call, not after

### Guard / Pre-check Hooks (v2)
- Allow external contracts to validate or reject transactions before execution
- Enables: address whitelists, spending limits, time-locks, circuit breakers
- Guard must be audited carefully — a broken guard can permanently freeze the vault

---

## 8. Modules (v2 Feature)

Modules extend the vault without modifying core logic. A module is a separate contract that, once trusted and registered, can call `execTransactionFromModule` on the vault — bypassing the N-of-M threshold.

**Built-in modules to implement in v2:**

| Module | Description |
|---|---|
| **Allowance Module** | Per-owner daily spending limits without requiring all signers |
| **Recovery Module** | Guardian-based account recovery (owner lost their key) |
| **Timelock Module** | Delays execution of sensitive operations by N blocks |
| **Spending Limit** | Caps on how much BTC/tokens can leave per period |

**Security requirement**: Only add thoroughly audited modules. A malicious module can execute arbitrary transactions and take over the vault.

---

## 9. Implementation Phases

### Phase 1 — Core Vault (MVP)
- [ ] `setup()` — initialize owners + threshold (enforce min-owners=3, min-threshold=2)
- [ ] `execTransaction()` — full signature verification + execution
- [ ] `addOwner()` / `removeOwner()` / `changeThreshold()`
- [ ] `getTransactionHash()` — off-chain signing helper
- [ ] Nonce management
- [ ] Native BTC receive and transfer support
- [ ] Events for all state changes
- [ ] Unit tests for all core paths

### Phase 1.5 — Test Tokens

Two tokens will be deployed alongside the vault to serve as controlled test assets during development and integration testing. They are not production contracts.

#### Alpha Token (OP-20 — Fungible)
- A standard OP-20 fungible token
- Name: `Alpha`, Symbol: `ALPHA`
- Fixed supply minted to a test address on deployment
- Used to test: OP-20 deposits into the vault, multi-sig approved OP-20 transfers out, balance tracking
- Implements the full OP-20 interface: `transfer`, `transferFrom`, `approve`, `allowance`, `balanceOf`, `totalSupply`

#### Beta Token (OP-721 — NFT)
- A standard OP-721 non-fungible token
- Name: `Beta`, Symbol: `BETA`
- A small set of tokens (e.g. IDs 1–10) minted to a test address on deployment
- Used to test: OP-721 deposits into the vault, multi-sig approved NFT transfers out, token ID tracking
- Implements the full OP-721 interface: `transferFrom`, `safeTransferFrom`, `ownerOf`, `approve`, `getApproved`, `setApprovalForAll`

#### Integration Test Coverage (using Alpha + Beta)
- [ ] Deposit ALPHA into vault, confirm balance update
- [ ] Propose + approve + execute OP-20 transfer of ALPHA out
- [ ] Deposit BETA NFT (tokenId=1) into vault, confirm holdings update
- [ ] Propose + approve + execute OP-721 transfer of BETA tokenId=1 out
- [ ] Mixed transaction: BTC + ALPHA + BETA all moved in one approved batch (Phase 4)

### Phase 2 — Guards
- [ ] `GuardManager` — set/unset a guard contract
- [ ] Pre-execution hook call
- [ ] Post-execution hook call
- [ ] Example guard: transfer value cap

### Phase 3 — Modules
- [ ] `ModuleManager` — enable/disable modules
- [ ] `execTransactionFromModule()` — module-only execution path
- [ ] Allowance Module implementation
- [ ] Recovery Module implementation

### Phase 4 — Advanced
- [ ] Contract signature support (ERC-1271 equivalent for OPNet)
- [ ] Batch transactions (multiple ops in one signed payload)
- [ ] Gas abstraction / relayer support
- [ ] Off-chain transaction service (collect signatures, share between owners)
- [ ] Frontend UI

---

## 10. OPNet-Specific Considerations

| EVM Concept | OPNet Equivalent | Notes |
|---|---|---|
| `msg.sender` | OPNet caller context | How OPNet exposes transaction sender |
| `delegatecall` | OPNet contract call mechanism | Check if delegatecall is supported |
| `ECDSA.recover` | OPNet signature recovery | Bitcoin uses secp256k1 — compatible |
| EIP-712 domain | OPNet domain separator | Adapt for OPNet chainId / network |
| ERC-20 token | OP-20 token | OPNet's token standard |
| ETH (native) | rBTC (native) | Native asset for the vault to hold |
| Gas | OPNet fee model | Understand fee mechanics for exec |
| Proxy pattern | OPNet deployment model | Verify if proxies are supported |
| Events / logs | OPNet event emission | Use for off-chain signature coordination |

---

## 11. Key Files (to be created)

```
multsig_vault/
├── VAULT_DESIGN.md              ← this document
├── src/
│   ├── MultSigVault.ts          ← core vault contract
│   ├── OwnerManager.ts          ← owner list + threshold logic
│   ├── Executor.ts              ← transaction execution + asset transfer logic
│   ├── GuardManager.ts          ← guard hook management (v2)
│   └── ModuleManager.ts         ← module registry (v2)
├── tokens/
│   ├── AlphaToken.ts            ← test OP-20 fungible token (Alpha / ALPHA)
│   └── BetaToken.ts             ← test OP-721 NFT (Beta / BETA)
├── modules/
│   ├── AllowanceModule.ts       ← daily spending limits (v2)
│   └── RecoveryModule.ts        ← guardian recovery (v2)
├── tests/
│   ├── MultSigVault.test.ts     ← core vault logic tests
│   ├── OwnerManager.test.ts     ← owner/threshold constraint tests
│   ├── Executor.test.ts         ← execution + signature tests
│   ├── AlphaToken.test.ts       ← OP-20 token unit tests
│   ├── BetaToken.test.ts        ← OP-721 token unit tests
│   └── integration/
│       ├── btc-transfer.test.ts       ← BTC deposit + multisig withdrawal
│       ├── op20-transfer.test.ts      ← ALPHA token vault integration
│       └── op721-transfer.test.ts     ← BETA NFT vault integration
└── scripts/
    ├── deploy.ts                ← deploy vault + both test tokens
    └── propose-tx.ts            ← off-chain tx proposal helper
```

---

## 12. References

- EIP-712 (Structured Data Signing): https://eips.ethereum.org/EIPS/eip-712
- ERC-1271 (Contract Signatures): https://eips.ethereum.org/EIPS/eip-1271
- OPNet Protocol: https://opnet.org
