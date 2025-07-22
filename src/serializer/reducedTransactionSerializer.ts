import type { UnsignedTransaction } from "@fleet-sdk/common";
import { type ByteInput, hex } from "@fleet-sdk/crypto";
import { SigmaByteReader, SigmaByteWriter } from "@fleet-sdk/serializer";
import { deserializeTransaction, serializeTransaction } from "./transactionSerializer";

export type ReducedInput = {
  sigmaProp: string;
  cost: bigint;
};

export type ReducedTransaction = {
  unsignedTx: UnsignedTransaction;
  txCost: bigint;
  reducedInputs: ReducedInput[];
};

export function serializeReducedTransaction(
  reducedTransaction: ReducedTransaction
): SigmaByteWriter {
  const txBytes = serializeTransaction(reducedTransaction.unsignedTx).toBytes();
  const writer = new SigmaByteWriter(txBytes.length + txBytes.length / 2)
    .writeUInt(txBytes.length)
    .writeBytes(txBytes);

  for (const input of reducedTransaction.reducedInputs) {
    writer
      .writeUInt(input.sigmaProp.length / 2)
      .writeHex(input.sigmaProp)
      .writeBigUInt(input.cost);
  }

  writer.writeBigUInt(reducedTransaction.txCost);

  return writer;
}

export function deserializeReducedTransaction(input: ByteInput): ReducedTransaction {
  const reader = new SigmaByteReader(input);

  reader.readUInt(); // skip transaction length
  const unsignedTx = deserializeTransaction<UnsignedTransaction>(reader);
  const reducedInputs: ReducedInput[] = [];
  for (let i = 0; i < unsignedTx.inputs.length; i++) {
    const len = reader.readUInt();
    const sigmaProp = hex.encode(reader.readBytes(len));
    const cost = reader.readBigUInt();

    reducedInputs.push({ sigmaProp, cost });
  }
  const txCost = reader.readBigUInt();

  return { unsignedTx, reducedInputs, txCost };
}
