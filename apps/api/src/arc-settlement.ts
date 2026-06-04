import {
  encodeFunctionData,
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  isHex,
  parseEventLogs,
  type Address,
  type Hex,
  type TransactionReceipt
} from "viem";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { privateKeyToAccount } from "viem/accounts";
import type * as CircleDeveloperWallets from "@circle-fin/developer-controlled-wallets";

const require = createRequire(import.meta.url);
const { initiateDeveloperControlledWalletsClient } = require(
  "@circle-fin/developer-controlled-wallets"
) as typeof CircleDeveloperWallets;

export const ARC_TESTNET_CHAIN_ID = 5042002;

const RETEMPO_SETTLEMENT_ABI = [
  {
    type: "function",
    name: "recordSettlement",
    inputs: [
      { name: "invoiceId", type: "string" },
      { name: "serviceId", type: "string" },
      { name: "payer", type: "address" },
      { name: "merchant", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "referenceHash", type: "bytes32" },
      { name: "timestamp", type: "uint256" }
    ],
    outputs: [{ name: "settlementId", type: "bytes32" }],
    stateMutability: "nonpayable"
  },
  {
    type: "event",
    name: "SettlementRecorded",
    inputs: [
      { name: "settlementId", type: "bytes32", indexed: true },
      { name: "invoiceId", type: "string", indexed: false },
      { name: "serviceId", type: "string", indexed: false },
      { name: "payer", type: "address", indexed: true },
      { name: "merchant", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "referenceHash", type: "bytes32", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false }
    ],
    anonymous: false
  }
] as const;

type SettlementRecordedArgs = {
  invoiceId?: string;
  serviceId?: string;
  payer?: Address;
  merchant?: Address;
  amount?: bigint;
  referenceHash?: Hex;
  timestamp?: bigint;
};

export type ChainSettlementInput = {
  invoiceId: string;
  serviceId: string;
  payer: Address;
  merchant: Address;
  amount: bigint;
  referenceHash: Hex;
  timestamp: bigint;
};

export type ChainSettlementResult = {
  transactionHash: Hex;
  receipt: TransactionReceipt;
  eventObserved: boolean;
  executor: "direct" | "circle";
  circleTransactionId?: string;
  circleTransactionState?: string;
};

export class ChainSettlementError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function requiredEnv(key: string) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new ChainSettlementError(`${key} is required.`);
  }
  return value;
}

export function settlementExecutionMode() {
  const mode = process.env.SETTLEMENT_EXECUTION_MODE?.trim().toLowerCase() || "direct";
  if (mode !== "circle" && mode !== "direct") {
    throw new ChainSettlementError("SETTLEMENT_EXECUTION_MODE must be circle or direct.");
  }
  return mode;
}

function getCircleClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: requiredEnv("CIRCLE_API_KEY"),
    entitySecret: requiredEnv("CIRCLE_ENTITY_SECRET")
  });
}

function getArcConfig() {
  const rpcUrl = requiredEnv("ARC_RPC_URL");
  const chainId = Number(requiredEnv("ARC_CHAIN_ID"));
  const settlementContractAddress = normalizeAddress(
    requiredEnv("RETEMPO_SETTLEMENT_CONTRACT_ADDRESS"),
    "RETEMPO_SETTLEMENT_CONTRACT_ADDRESS"
  );
  const arcTestnetSettlementAddress = normalizeAddress(
    requiredEnv("ARC_TESTNET_RETEMPO_SETTLEMENT_ADDRESS"),
    "ARC_TESTNET_RETEMPO_SETTLEMENT_ADDRESS"
  );

  if (chainId !== ARC_TESTNET_CHAIN_ID) {
    throw new ChainSettlementError(`ARC_CHAIN_ID must be ${ARC_TESTNET_CHAIN_ID}.`);
  }
  if (settlementContractAddress !== arcTestnetSettlementAddress) {
    throw new ChainSettlementError(
      "RETEMPO_SETTLEMENT_CONTRACT_ADDRESS must match ARC_TESTNET_RETEMPO_SETTLEMENT_ADDRESS."
    );
  }

  return {
    chain: {
      id: ARC_TESTNET_CHAIN_ID,
      name: "Arc Testnet",
      nativeCurrency: { decimals: 6, name: "USDC", symbol: "USDC" },
      rpcUrls: { default: { http: [rpcUrl] } }
    },
    contractAddress: settlementContractAddress,
    rpcUrl
  };
}

function getDirectArcConfig() {
  const config = getArcConfig();
  const privateKey = requiredEnv("ARC_DEPLOYER_PRIVATE_KEY");
  const operatorAddress = normalizeAddress(requiredEnv("RETEMPO_OPERATOR_ADDRESS"), "RETEMPO_OPERATOR_ADDRESS");

  const formattedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (!isHex(formattedPrivateKey)) {
    throw new ChainSettlementError("ARC_DEPLOYER_PRIVATE_KEY must be a hex private key.");
  }

  const account = privateKeyToAccount(formattedPrivateKey);
  if (getAddress(account.address) !== operatorAddress) {
    throw new ChainSettlementError("ARC_DEPLOYER_PRIVATE_KEY does not match RETEMPO_OPERATOR_ADDRESS.");
  }

  return {
    ...config,
    account,
    operatorAddress
  };
}

export function normalizeAddress(value: string, fieldName: string): Address {
  if (!isAddress(value)) {
    throw new ChainSettlementError(`${fieldName} must be a valid address.`);
  }
  return getAddress(value);
}

export function normalizeBytes32(value: string, fieldName: string): Hex {
  if (!isHex(value) || value.length !== 66) {
    throw new ChainSettlementError(`${fieldName} must be a 32-byte hex value.`);
  }
  return value;
}

export function decimalStringToUnits(value: string, decimals = 6) {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new ChainSettlementError("Settlement amount must be a non-negative decimal.");
  }

  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) {
    throw new ChainSettlementError(`Settlement amount supports at most ${decimals} decimal places.`);
  }

  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0"));
}

export async function submitArcSettlement(input: ChainSettlementInput): Promise<ChainSettlementResult> {
  const mode = settlementExecutionMode();
  if (mode === "circle") {
    return submitCircleSettlement(input);
  }
  return submitDirectArcSettlement(input);
}

async function submitDirectArcSettlement(input: ChainSettlementInput): Promise<ChainSettlementResult> {
  const config = getDirectArcConfig();
  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl)
  });
  const walletClient = createWalletClient({
    account: config.account,
    chain: config.chain,
    transport: http(config.rpcUrl)
  });

  const transactionHash = await walletClient.writeContract({
    address: config.contractAddress,
    abi: RETEMPO_SETTLEMENT_ABI,
    functionName: "recordSettlement",
    args: [
      input.invoiceId,
      input.serviceId,
      input.payer,
      input.merchant,
      input.amount,
      input.referenceHash,
      input.timestamp
    ]
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 1
  });

  return {
    transactionHash,
    receipt,
    eventObserved: settlementRecordedEventObserved(receipt, input),
    executor: "direct"
  };
}

async function submitCircleSettlement(input: ChainSettlementInput): Promise<ChainSettlementResult> {
  const config = getArcConfig();
  const client = getCircleClient();

  const createdTransaction = await client.createContractExecutionTransaction({
    callData: encodeSettlementCallData(input),
    contractAddress: config.contractAddress,
    fee: {
      type: "level",
      config: { feeLevel: "HIGH" }
    },
    idempotencyKey: randomUUID(),
    refId: input.referenceHash,
    walletId: requiredEnv("CIRCLE_WALLET_ID")
  });
  const circleTransactionId = createdTransaction.data?.id;
  if (!circleTransactionId) {
    throw new ChainSettlementError("Circle did not return a transaction ID.");
  }

  const transactionResponse = await client.getTransaction({
    id: circleTransactionId,
    pollingInterval: 2000,
    waitForState: "CONFIRMED"
  });
  const transaction = transactionResponse.data?.transaction;
  const circleTransactionState = transaction?.state;
  if (circleTransactionState !== "CONFIRMED" && circleTransactionState !== "COMPLETE") {
    throw new ChainSettlementError("Circle transaction did not reach CONFIRMED or COMPLETE.");
  }
  if (!transaction?.txHash) {
    throw new ChainSettlementError("Circle transaction is confirmed but missing txHash.");
  }

  const transactionHash = normalizeBytes32(transaction.txHash, "Circle txHash");
  const receiptResult = await readArcSettlementReceipt(transactionHash, input);

  return {
    transactionHash,
    receipt: receiptResult.receipt,
    eventObserved: receiptResult.eventObserved,
    executor: "circle",
    circleTransactionId,
    circleTransactionState
  };
}

export async function getCircleSettlementWalletAddress() {
  const response = await getCircleClient().getWallet({ id: requiredEnv("CIRCLE_WALLET_ID") });
  const wallet = response.data?.wallet as { address?: string } | undefined;
  if (!wallet?.address) {
    throw new ChainSettlementError("Circle wallet response did not include an address.");
  }
  return normalizeAddress(wallet.address, "Circle wallet address");
}

export async function readArcSettlementReceipt(transactionHash: Hex, expected: Partial<ChainSettlementInput>) {
  const config = getArcConfig();
  const publicClient = createPublicClient({
    chain: config.chain,
    transport: http(config.rpcUrl)
  });
  const receipt = await publicClient.getTransactionReceipt({ hash: transactionHash });

  return {
    receipt,
    eventObserved: settlementRecordedEventObserved(receipt, expected)
  };
}

function settlementRecordedEventObserved(receipt: TransactionReceipt, expected: Partial<ChainSettlementInput>) {
  const logs = parseEventLogs({
    abi: RETEMPO_SETTLEMENT_ABI,
    eventName: "SettlementRecorded",
    logs: receipt.logs
  });

  return logs.some((log) => {
    const args = log.args as SettlementRecordedArgs;
    return (
      matches(args.invoiceId, expected.invoiceId) &&
      matches(args.serviceId, expected.serviceId) &&
      matches(args.payer ? getAddress(args.payer) : undefined, expected.payer) &&
      matches(args.merchant ? getAddress(args.merchant) : undefined, expected.merchant) &&
      matches(args.amount, expected.amount) &&
      matches(args.referenceHash, expected.referenceHash) &&
      matches(args.timestamp, expected.timestamp)
    );
  });
}

function encodeSettlementCallData(input: ChainSettlementInput) {
  return encodeFunctionData({
    abi: RETEMPO_SETTLEMENT_ABI,
    functionName: "recordSettlement",
    args: [
      input.invoiceId,
      input.serviceId,
      input.payer,
      input.merchant,
      input.amount,
      input.referenceHash,
      input.timestamp
    ]
  });
}

function matches<T>(actual: T | undefined, expected: T | undefined) {
  return expected === undefined || actual === expected;
}
