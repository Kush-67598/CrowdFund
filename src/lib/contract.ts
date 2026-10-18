import { createPublicClient, http, isAddress } from 'viem';
import { sepolia } from 'viem/chains';
export { sepolia };
// ABI derived directly from the supplied Crowdfund.sol public functions and events.
export const crowdfundAbi = [
  { type: 'function', name: 'owner', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'goal', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'deadline', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'totalRaised', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'withdrawn', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'contributions', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'contribute', stateMutability: 'payable', inputs: [], outputs: [] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'refund', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'event', name: 'Contributed', anonymous: false, inputs: [{ indexed: true, name: 'from', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }] },
  { type: 'event', name: 'Withdrawn', anonymous: false, inputs: [{ indexed: false, name: 'amount', type: 'uint256' }] },
  { type: 'event', name: 'Refunded', anonymous: false, inputs: [{ indexed: true, name: 'to', type: 'address' }, { indexed: false, name: 'amount', type: 'uint256' }] },
] as const;

const configuredAddress = process.env.NEXT_PUBLIC_CROWDFUND_CONTRACT_ADDRESS;
export const contractAddress = configuredAddress && isAddress(configuredAddress) ? configuredAddress : undefined;
const rpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com';
export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(rpcUrl),
});
