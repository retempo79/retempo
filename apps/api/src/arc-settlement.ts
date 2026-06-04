import {
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
import { privateKeyToAccount } from "viem/accounts";

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

function getArcConfig() {
  const rpcUrl = requiredEnv("ARC_RPC_URL");
  const chainId = Number(requiredEnv("ARC_CHAIN_ID"));
  const privateKey = requiredEnv("ARC_DEPLOYER_PRIVATE_KEY");
  const operatorAddress = normalizeAddress(requiredEnv("RETEMPO_OPERATOR_ADDRESS"), "RETEMPO_OPERATOR_ADDRESS");
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

  const formattedPrivateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  if (!isHex(formattedPrivateKey)) {
    throw new ChainSettlementError("ARC_DEPLOYER_PRIVATE_KEY must be a hex private key.");
  }

  const account = privateKeyToAccount(formattedPrivateKey);
  if (getAddress(account.address) !== operatorAddress) {
    throw new ChainSettlementError("ARC_DEPLOYER_PRIVATE_KEY does not match RETEMPO_OPERATOR_ADDRESS.");
  }

  return {
    account,
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
  const config = getArcConfig();
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
    eventObserved: settlementRecordedEventObserved(receipt, input)
  };
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

function matches<T>(actual: T | undefined, expected: T | undefined) {
  return expected === undefined || actual === expected;
}
