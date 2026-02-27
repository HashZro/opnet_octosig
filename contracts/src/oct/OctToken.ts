import {
    Blockchain,
    BytesWriter,
    Calldata,
    OP20,
    OP20InitParameters,
} from '@btc-vision/btc-runtime/runtime';
import { u256 } from '@btc-vision/as-bignum/assembly';

@final
export class OctToken extends OP20 {
    public override onDeployment(_calldata: Calldata): void {
        super.onDeployment(_calldata);

        // 1,000,000 OCT with 18 decimals = 10^24
        const maxSupply: u256 = u256.fromString('1000000000000000000000000');
        const decimals: u8 = 18;
        const name: string = 'Octoken';
        const symbol: string = 'OCT';

        this.instantiate(new OP20InitParameters(maxSupply, decimals, name, symbol));
    }

    /**
     * mine() — free claim, receive 100 OCT per call
     */
    @method()
    @returns({ name: 'amount', type: ABIDataTypes.UINT256 })
    public mine(_calldata: Calldata): BytesWriter {
        // 100 OCT = 100 * 10^18
        const MINT_AMOUNT: u256 = u256.fromString('100000000000000000000');

        this._mint(Blockchain.tx.sender, MINT_AMOUNT);

        const response = new BytesWriter(32);
        response.writeU256(MINT_AMOUNT);
        return response;
    }
}
