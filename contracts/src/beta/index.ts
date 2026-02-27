import { Blockchain } from '@btc-vision/btc-runtime/runtime';
import { revertOnError } from '@btc-vision/btc-runtime/runtime/abort/abort';
import { BetaToken } from './BetaToken';

// DO NOT MODIFY — required contract factory registration
Blockchain.contract = () => {
    return new BetaToken();
};

// REQUIRED — re-exports the WASM entry points (execute, onDeploy, onUpdate)
export * from '@btc-vision/btc-runtime/runtime/exports';

// REQUIRED — AssemblyScript abort override; wired via asconfig.json "use" field
export function abort(message: string, fileName: string, line: u32, column: u32): void {
    revertOnError(message, fileName, line, column);
}
