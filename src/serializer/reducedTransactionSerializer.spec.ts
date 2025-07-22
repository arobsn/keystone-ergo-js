import { hex } from "@fleet-sdk/crypto";
import { describe, expect, it } from "vitest";
import {
  deserializeReducedTransaction,
  serializeReducedTransaction
} from "./reducedTransactionSerializer";

const reducedTxBytes =
  "9702011a9f15bfac9379c882fe0b7ecb2288153ce4f2def4f272214fb80f8e2630f04c00000001fbbaac7337d051c10fc3da0ccb864f4d32d40027551e1c3ea3ce361f39b91e4003c0843d240008cd02dc5b9d9d2081889ef00e6452fb5ad1730df42444ceccb9ea02258256d2fbd262e4f25601006400c0843d691005040004000e36100204a00b08cd0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798ea02d192a39a8cc7a701730073011001020402d19683030193a38cc7b2a57300000193c2b2a57301007473027303830108cdeeac93b1a57304e4f2560000809bee02240008cd0388fa54338147371023aacb846c96c57e72cdcd73bc85d20250467e5b79dfa2aae4f2560100640022cd0388fa54338147371023aacb846c96c57e72cdcd73bc85d20250467e5b79dfa2aa0000";

describe("Transaction serialization", () => {
  it("Should roundtrip reduced transaction", () => {
    const parsed = deserializeReducedTransaction(reducedTxBytes);
    const serialized = serializeReducedTransaction(parsed).encode(hex);
    expect(serialized).toBe(reducedTxBytes);
  });
});
