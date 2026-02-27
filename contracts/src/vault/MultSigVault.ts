import {
    Blockchain,
    BytesWriter,
    BytesReader,
    Calldata,
    OP_NET,
    Revert,
    SafeMath,
    StoredU256,
    TransferHelper,
    Address,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

// Max owners per vault (bounded for-loop constraint)
const MAX_OWNERS: u8 = 10;

const ONE: u256 = u256.fromU32(1);
const ZERO: u256 = u256.fromU32(0);
const EMPTY_SUB: Uint8Array = new Uint8Array(30);

// ═══════════════════════════════════════════════════════════════════════
//  v3 — Gas-optimized MultSigVault
//
//  Key changes from v2:
//  1. Storage keys use direct pointer||data (no SHA256) — matches
//     encodePointer pattern from btc-runtime/math/abi.ts
//  2. Owner flags eliminated — linear scan replaces flag lookup
//  3. In-memory duplicate detection in createVault (no storage reads)
//  4. Merged requireOwner + findOwnerIndex into single scan
//  5. Separate u16 pointer per vault field (avoids compound key hashing)
// ═══════════════════════════════════════════════════════════════════════

@final
export class MultSigVault extends OP_NET {
    // ── Global storage ──
    private readonly _vaultCount: StoredU256 = new StoredU256(
        Blockchain.nextPointer,
        EMPTY_SUB,
    );

    // ── Per-vault field pointers (one u16 pointer per field, keyed by vaultId) ──
    private readonly pThreshold: u16 = Blockchain.nextPointer;
    private readonly pOwnerCount: u16 = Blockchain.nextPointer;
    private readonly pToken: u16 = Blockchain.nextPointer;
    private readonly pBalance: u16 = Blockchain.nextPointer;
    private readonly pTotalProposals: u16 = Blockchain.nextPointer;
    private readonly pHasProposal: u16 = Blockchain.nextPointer;

    // ── Owner list (keyed by vaultId + index) ──
    private readonly pOwner: u16 = Blockchain.nextPointer;

    // ── Proposal field pointers (one per field, keyed by vaultId) ──
    private readonly pPropTo: u16 = Blockchain.nextPointer;
    private readonly pPropAmount: u16 = Blockchain.nextPointer;
    private readonly pPropApprovals: u16 = Blockchain.nextPointer;

    // ── Approval flags (keyed by vaultId + ownerIdx) ──
    private readonly pApproval: u16 = Blockchain.nextPointer;

    public override onDeployment(_calldata: Calldata): void {
        super.onDeployment(_calldata);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Storage key helpers — NO SHA256
    //
    //  Keys are 32 bytes: [pointer_hi, pointer_lo, 0...0, vaultId(4 bytes)]
    //  or with index:     [pointer_hi, pointer_lo, 0...0, vaultId(4 bytes), idx]
    //
    //  This matches the encodePointer(u16, Uint8Array(30)) format used by
    //  StoredU256 and other runtime types — just direct concatenation.
    //  Uniqueness is guaranteed by unique u16 pointers from nextPointer.
    // ══════════════════════════════════════════════════════════════════════

    // Key for a vault field: [ptr(2)] + [zeros(26)] + [vaultId_lo32(4)]
    @inline
    private fieldKey(ptr: u16, vaultId: u256): Uint8Array {
        const k = new Uint8Array(32);
        k[0] = u8((ptr >> 8) & 0xFF);
        k[1] = u8(ptr & 0xFF);
        const id: u32 = u32(vaultId.lo1);
        k[28] = u8((id >> 24) & 0xFF);
        k[29] = u8((id >> 16) & 0xFF);
        k[30] = u8((id >> 8) & 0xFF);
        k[31] = u8(id & 0xFF);
        return k;
    }

    // Key for indexed slot: [ptr(2)] + [zeros(25)] + [vaultId_lo32(4)] + [idx(1)]
    @inline
    private idxKey(ptr: u16, vaultId: u256, idx: u8): Uint8Array {
        const k = new Uint8Array(32);
        k[0] = u8((ptr >> 8) & 0xFF);
        k[1] = u8(ptr & 0xFF);
        const id: u32 = u32(vaultId.lo1);
        k[27] = u8((id >> 24) & 0xFF);
        k[28] = u8((id >> 16) & 0xFF);
        k[29] = u8((id >> 8) & 0xFF);
        k[30] = u8(id & 0xFF);
        k[31] = idx;
        return k;
    }

    // ── Raw storage read/write ──

    @inline
    private su(key: Uint8Array, val: u256): void {
        Blockchain.setStorageAt(key, val.toUint8Array(true));
    }

    @inline
    private lu(key: Uint8Array): u256 {
        return u256.fromUint8ArrayBE(Blockchain.getStorageAt(key));
    }

    @inline
    private sa(key: Uint8Array, addr: Address): void {
        const w = new BytesWriter(32);
        w.writeAddress(addr);
        Blockchain.setStorageAt(key, w.getBuffer());
    }

    @inline
    private la(key: Uint8Array): Address {
        return new BytesReader(Blockchain.getStorageAt(key)).readAddress();
    }

    // ── Owner helpers (no flag storage — linear scan) ──

    @inline
    private getOwnerCount(vaultId: u256): u8 {
        return u8(this.lu(this.fieldKey(this.pOwnerCount, vaultId)).lo1 & 0xff);
    }

    // Replaces both requireOwner() and findOwnerIndex() — single scan
    private requireOwnerIdx(vaultId: u256): u8 {
        const sender = Blockchain.tx.sender;
        const count = this.getOwnerCount(vaultId);
        for (let i: u8 = 0; i < count; i++) {
            if (this.la(this.idxKey(this.pOwner, vaultId, i)) == sender) return i;
        }
        throw new Revert('not an owner');
    }

    private requireVault(vaultId: u256): void {
        if (vaultId >= this._vaultCount.value) {
            throw new Revert('vault not found');
        }
    }

    // ── Proposal cleanup ──

    private clearProposal(vaultId: u256): void {
        Blockchain.setStorageAt(this.fieldKey(this.pPropTo, vaultId), new Uint8Array(32));
        this.su(this.fieldKey(this.pPropAmount, vaultId), ZERO);
        this.su(this.fieldKey(this.pPropApprovals, vaultId), ZERO);

        const count = this.getOwnerCount(vaultId);
        for (let i: u8 = 0; i < count; i++) {
            this.su(this.idxKey(this.pApproval, vaultId, i), ZERO);
        }

        this.su(this.fieldKey(this.pHasProposal, vaultId), ZERO);
    }

    // ══════════════════════════════════════════════════════════════════════
    //  Public methods
    // ══════════════════════════════════════════════════════════════════════

    @method()
    @returns({ name: 'vaultId', type: ABIDataTypes.UINT256 })
    public createVault(calldata: Calldata): BytesWriter {
        const token: Address = calldata.readAddress();
        const ownerCount: u8 = calldata.readU8();

        if (ownerCount < 2) throw new Revert('min 2 owners');
        if (ownerCount > MAX_OWNERS) throw new Revert('max 10 owners');

        const vaultId: u256 = this._vaultCount.value;

        // In-memory duplicate detection — vault is new so no storage reads needed
        const owners: Address[] = [];
        for (let i: u8 = 0; i < ownerCount; i++) {
            const owner: Address = calldata.readAddress();
            if (owner.isZero()) throw new Revert('zero address');

            for (let j: i32 = 0; j < owners.length; j++) {
                if (owners[j] == owner) throw new Revert('duplicate owner');
            }
            owners.push(owner);

            // Write owner at index — no flag storage needed
            this.sa(this.idxKey(this.pOwner, vaultId, i), owner);
        }

        const threshold: u8 = calldata.readU8();
        if (threshold < 2) throw new Revert('min threshold 2');
        if (threshold > ownerCount) throw new Revert('threshold > owners');

        this.su(this.fieldKey(this.pThreshold, vaultId), u256.fromU32(u32(threshold)));
        this.su(this.fieldKey(this.pOwnerCount, vaultId), u256.fromU32(u32(ownerCount)));
        this.sa(this.fieldKey(this.pToken, vaultId), token);
        // balance, totalProposals, hasProposal default to zero — skip writes

        this._vaultCount.set(SafeMath.add(vaultId, ONE));

        const resp = new BytesWriter(32);
        resp.writeU256(vaultId);
        return resp;
    }

    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public deposit(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();
        const amount: u256 = calldata.readU256();
        this.requireVault(vaultId);

        if (amount == ZERO) throw new Revert('amount is zero');

        const token: Address = this.la(this.fieldKey(this.pToken, vaultId));

        TransferHelper.transferFrom(
            token,
            Blockchain.tx.sender,
            Blockchain.contractAddress,
            amount,
        );

        const balKey = this.fieldKey(this.pBalance, vaultId);
        const bal = this.lu(balKey);
        this.su(balKey, SafeMath.add(bal, amount));

        const resp = new BytesWriter(1);
        resp.writeBoolean(true);
        return resp;
    }

    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public propose(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();
        const to: Address = calldata.readAddress();
        const amount: u256 = calldata.readU256();

        this.requireVault(vaultId);
        const senderIdx = this.requireOwnerIdx(vaultId);

        if (amount == ZERO) throw new Revert('amount is zero');
        if (to.isZero()) throw new Revert('zero recipient');

        const bal = this.lu(this.fieldKey(this.pBalance, vaultId));
        if (amount > bal) throw new Revert('insufficient balance');

        // Delete existing proposal if one exists
        const hasPropKey = this.fieldKey(this.pHasProposal, vaultId);
        const hasProp = this.lu(hasPropKey);
        if (hasProp != ZERO) {
            this.clearProposal(vaultId);
        }

        // Write new proposal
        this.sa(this.fieldKey(this.pPropTo, vaultId), to);
        this.su(this.fieldKey(this.pPropAmount, vaultId), amount);
        this.su(this.fieldKey(this.pPropApprovals, vaultId), ONE);

        // Auto-vote yes for proposer
        this.su(this.idxKey(this.pApproval, vaultId, senderIdx), ONE);

        // Mark active proposal + increment lifetime counter
        this.su(hasPropKey, ONE);
        const totalKey = this.fieldKey(this.pTotalProposals, vaultId);
        const total = this.lu(totalKey);
        this.su(totalKey, SafeMath.add(total, ONE));

        const resp = new BytesWriter(1);
        resp.writeBoolean(true);
        return resp;
    }

    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public approve(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();

        this.requireVault(vaultId);
        const senderIdx = this.requireOwnerIdx(vaultId);

        const hasProp = this.lu(this.fieldKey(this.pHasProposal, vaultId));
        if (hasProp == ZERO) throw new Revert('no active proposal');

        const apKey = this.idxKey(this.pApproval, vaultId, senderIdx);
        const already = this.lu(apKey);
        if (already != ZERO) throw new Revert('already approved');

        this.su(apKey, ONE);

        const curKey = this.fieldKey(this.pPropApprovals, vaultId);
        const cur = this.lu(curKey);
        this.su(curKey, SafeMath.add(cur, ONE));

        const resp = new BytesWriter(1);
        resp.writeBoolean(true);
        return resp;
    }

    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public executeProposal(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();

        this.requireVault(vaultId);

        const hasProp = this.lu(this.fieldKey(this.pHasProposal, vaultId));
        if (hasProp == ZERO) throw new Revert('no active proposal');

        const approvals = this.lu(this.fieldKey(this.pPropApprovals, vaultId));
        const threshold = this.lu(this.fieldKey(this.pThreshold, vaultId));
        if (approvals < threshold) throw new Revert('threshold not met');

        // Read proposal data before clearing (CEI pattern)
        const amount = this.lu(this.fieldKey(this.pPropAmount, vaultId));
        const to: Address = this.la(this.fieldKey(this.pPropTo, vaultId));
        const token: Address = this.la(this.fieldKey(this.pToken, vaultId));

        // Update state BEFORE external call
        const balKey = this.fieldKey(this.pBalance, vaultId);
        const bal = this.lu(balKey);
        this.su(balKey, SafeMath.sub(bal, amount));

        // Delete proposal
        this.clearProposal(vaultId);

        // External call: transfer tokens
        TransferHelper.transfer(token, to, amount);

        const resp = new BytesWriter(1);
        resp.writeBoolean(true);
        return resp;
    }

    // ══════════════════════════════════════════════════════════════════════
    //  View methods
    // ══════════════════════════════════════════════════════════════════════

    @method()
    @returns({ name: 'count', type: ABIDataTypes.UINT256 })
    public getVaultCount(_calldata: Calldata): BytesWriter {
        const resp = new BytesWriter(32);
        resp.writeU256(this._vaultCount.value);
        return resp;
    }

    @method()
    public getVaultInfo(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();
        this.requireVault(vaultId);

        const threshold = this.lu(this.fieldKey(this.pThreshold, vaultId));
        const ownerCount = this.lu(this.fieldKey(this.pOwnerCount, vaultId));
        const token: Address = this.la(this.fieldKey(this.pToken, vaultId));
        const balance = this.lu(this.fieldKey(this.pBalance, vaultId));
        const totalProposals = this.lu(this.fieldKey(this.pTotalProposals, vaultId));
        const hasProposal = this.lu(this.fieldKey(this.pHasProposal, vaultId));

        const countU8: u8 = u8(ownerCount.lo1 & 0xff);
        const owners: Address[] = [];
        for (let i: u8 = 0; i < countU8; i++) {
            owners.push(this.la(this.idxKey(this.pOwner, vaultId, i)));
        }

        const resp = new BytesWriter(32 * 6 + 2 + i32(countU8) * 32);
        resp.writeU256(threshold);
        resp.writeU256(ownerCount);
        resp.writeAddress(token);
        resp.writeU256(balance);
        resp.writeU256(totalProposals);
        resp.writeU256(hasProposal);
        resp.writeAddressArray(owners);
        return resp;
    }

    @method()
    public getProposal(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();
        this.requireVault(vaultId);

        const hasProp = this.lu(this.fieldKey(this.pHasProposal, vaultId));
        if (hasProp == ZERO) throw new Revert('no active proposal');

        const to: Address = this.la(this.fieldKey(this.pPropTo, vaultId));
        const amount = this.lu(this.fieldKey(this.pPropAmount, vaultId));
        const approvals = this.lu(this.fieldKey(this.pPropApprovals, vaultId));

        const resp = new BytesWriter(96);
        resp.writeAddress(to);
        resp.writeU256(amount);
        resp.writeU256(approvals);
        return resp;
    }

    @method()
    @returns({ name: 'result', type: ABIDataTypes.BOOL })
    public checkOwner(calldata: Calldata): BytesWriter {
        const vaultId: u256 = calldata.readU256();
        const addr: Address = calldata.readAddress();
        this.requireVault(vaultId);

        const count = this.getOwnerCount(vaultId);
        let isOwner = false;
        for (let i: u8 = 0; i < count; i++) {
            if (this.la(this.idxKey(this.pOwner, vaultId, i)) == addr) {
                isOwner = true;
                break;
            }
        }

        const resp = new BytesWriter(1);
        resp.writeBoolean(isOwner);
        return resp;
    }
}
