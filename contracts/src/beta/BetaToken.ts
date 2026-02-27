import {
    Blockchain,
    BytesWriter,
    Calldata,
    OP20,
    OP20InitParameters,
    Revert,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class BetaToken extends OP20 {
    public override onDeployment(_calldata: Calldata): void {
        super.onDeployment(_calldata);

        // 1,000,000,000 BETA with 18 decimals = 10^27
        const maxSupply: u256 = u256.fromString('1000000000000000000000000000');
        const decimals: u8 = 18;
        const name: string = 'Beta';
        const symbol: string = 'BETA';

        this.instantiate(new OP20InitParameters(maxSupply, decimals, name, symbol));

        // Pre-mint 10,000,000 BETA to deployer for testing; remainder mineable
        const deployerAlloc: u256 = u256.fromString('10000000000000000000000000');
        this._mint(Blockchain.tx.origin, deployerAlloc);
    }

    /**
     * mine() — pay 0.00001 BTC (1000 sat), receive 100 BETA
     *
     * The caller must include an output of at least 1000 satoshis to this
     * contract address in the same transaction.
     */
    @payable()
    @method()
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public mine(_calldata: Calldata): BytesWriter {
        const MIN_SATS: u64 = 1000; // 0.00001 BTC
        // 100 BETA = 100 * 10^18
        const MINT_AMOUNT: u256 = u256.fromString('100000000000000000000');

        const contractAddr = Blockchain.contractAddress; // 32-byte Address
        let btcSent: u64 = 0;

        const outputs = Blockchain.tx.outputs;
        for (let i = 0; i < outputs.length; i++) {
            const output = outputs[i];
            if (output.isOPReturn) continue;

            if (output.hasScriptPubKey) {
                const script = output.scriptPublicKey;
                if (script !== null && script.length == 34 && script[1] == 0x20) {
                    // P2WSH (version 0): 0x00 0x20 <32-bytes>
                    // P2TR  (version 1): 0x51 0x20 <32-bytes>
                    let match: bool = true;
                    for (let j: i32 = 0; j < 32; j++) {
                        if (script[j + 2] != contractAddr[j]) {
                            match = false;
                            break;
                        }
                    }
                    if (match) btcSent += output.value;
                }
            }
        }

        if (btcSent < MIN_SATS) {
            throw new Revert('mine: send at least 0.00001 BTC (1000 sat) to this contract');
        }

        this._mint(Blockchain.tx.origin, MINT_AMOUNT);

        const response = new BytesWriter(32);
        response.writeU256(MINT_AMOUNT);
        return response;
    }
}
