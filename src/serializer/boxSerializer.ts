import type {
  Amount,
  Box,
  BoxCandidate,
  NonMandatoryRegisters,
  TokenAmount
} from "@fleet-sdk/common";
import { ensureBigInt, isDefined } from "@fleet-sdk/common";
import { type ByteInput, blake2b256, hex } from "@fleet-sdk/crypto";
import { SConstant, SigmaByteReader, SigmaByteWriter } from "@fleet-sdk/serializer";

export function serializeBox(
  box: Box<Amount> | BoxCandidate<Amount>,
  writer = new SigmaByteWriter(4_096),
  distinctTokenIds?: string[]
): SigmaByteWriter {
  writer
    .writeBigUInt(ensureBigInt(box.value))
    .writeUInt(box.ergoTree.length / 2) // include size in bytes
    .writeHex(box.ergoTree)
    .writeUInt(box.creationHeight);

  writeTokens(writer, box.assets, distinctTokenIds);
  writeRegisters(writer, box.additionalRegisters);

  if (isDefined(distinctTokenIds)) return writer;
  if (!isBox(box)) throw new Error("Invalid box type.");
  return writer.writeHex(box.transactionId).writeUInt(box.index);
}

function isBox<T extends Amount>(box: Box<Amount> | BoxCandidate<Amount>): box is Box<T> {
  const castedBox = box as Box<T>;
  return isDefined(castedBox.transactionId) && isDefined(castedBox.index);
}

function writeTokens(
  writer: SigmaByteWriter,
  tokens: TokenAmount<Amount>[],
  tokenIds?: string[]
): void {
  if (tokenIds) {
    writer.writeArray(tokens, (w, token) =>
      w.writeUInt(tokenIds.indexOf(token.tokenId)).writeBigUInt(ensureBigInt(token.amount))
    );
  } else {
    writer.writeArray(tokens, (w, token) =>
      w.writeHex(token.tokenId).writeBigUInt(ensureBigInt(token.amount))
    );
  }
}

function writeRegisters(writer: SigmaByteWriter, registers: NonMandatoryRegisters): void {
  const keys = Object.keys(registers).sort();
  const values: string[] = [];

  for (const key of keys) {
    const value = registers[key as keyof NonMandatoryRegisters];
    if (!value) continue;

    values.push(value);
  }

  writer.writeArray(values, (w, value) => w.writeHex(value));
}

/**
 * Deserializes a box embedded in a transaction.
 *
 * It efficiently calculates the box ID by accumulating the serialized data during
 * deserialization and applying blake2b256 hashing, avoiding redundant serialization
 * operations.
 *
 * @param reader - SigmaByteReader containing the serialized box data
 * @param distinctTokenIds - Array of TokenIDs referenced in the parent transaction
 * @param transactionId - ID of the transaction containing this box
 * @param index - Index position of the box in the transaction outputs
 * @returns A fully deserialized Box with all properties including boxId
 */
export function deserializeEmbeddedBox(
  reader: SigmaByteReader,
  distinctTokenIds: string[],
  transactionId: string,
  index: number
): Box<bigint> {
  // SigmaByteReader moves the cursor on read, so we need to save the current position to
  // track read bytes.
  let begin = reader.cursor;

  const value = reader.readBigUInt();
  const ergoTree = hex.encode(readErgoTree(reader));
  const creationHeight = reader.readUInt();

  // Calculating the BoxID needs the full box data, so to avoid serialization road-trips,
  // we will accumulate the the box data in a SigmaByteWriter and then calculate the hash
  // from the its bytes.
  const boxIdWriter = new SigmaByteWriter(4_096) // max size of a box
    .writeBytes(reader.bytes.subarray(begin, reader.cursor)); // copy the bytes read so far

  const assets = readTokens(reader, distinctTokenIds);

  // TokenIDs need to be written in the full box writer
  boxIdWriter.writeUInt(assets.length);
  for (const asset of assets) {
    boxIdWriter.writeHex(asset.tokenId).writeBigUInt(asset.amount);
  }

  begin = reader.cursor; // save the current cursor position again to track the registers bytes
  const additionalRegisters = readRegisters(reader);

  boxIdWriter
    .writeBytes(reader.bytes.subarray(begin, reader.cursor)) // write the registers
    .writeHex(transactionId)
    .writeUInt(index);

  return {
    boxId: hex.encode(blake2b256(boxIdWriter.toBytes())),
    value,
    ergoTree,
    creationHeight,
    assets,
    additionalRegisters,
    transactionId,
    index
  };
}

export function deserializeBox(
  input: ByteInput | SigmaByteReader
): BoxCandidate<bigint> | Box<bigint> {
  const reader = input instanceof SigmaByteReader ? input : new SigmaByteReader(input);
  const begin = reader.cursor; // save the current cursor position to track the read bytes

  const box: Box<bigint> = {
    boxId: "", // placeholder, will be calculated later
    value: reader.readBigUInt(),
    ergoTree: hex.encode(readErgoTree(reader)),
    creationHeight: reader.readUInt(),
    assets: readTokens(reader),
    additionalRegisters: readRegisters(reader),
    transactionId: hex.encode(reader.readBytes(32)),
    index: reader.readUInt()
  };

  box.boxId = hex.encode(blake2b256(reader.bytes.subarray(begin, reader.cursor)));
  return box;
}

function readErgoTree(reader: SigmaByteReader): Uint8Array {
  const size = reader.readUInt();
  return reader.readBytes(size);
}

function readTokens(reader: SigmaByteReader, tokenIds?: string[]): TokenAmount<bigint>[] {
  return reader.readArray((r) => ({
    tokenId: tokenIds ? (tokenIds[r.readUInt()] as string) : hex.encode(r.readBytes(32)),
    amount: r.readBigUInt()
  }));
}

function readRegisters(reader: SigmaByteReader): NonMandatoryRegisters {
  const registers: NonMandatoryRegisters = {};
  const count = reader.readUInt();

  for (let i = 0; i < count; i++) {
    // const key = reader.readByte();
    const value = SConstant.from(reader).toHex();
    registers[`R${(i + 4).toString()}` as keyof NonMandatoryRegisters] = value;
  }

  return registers;
}
