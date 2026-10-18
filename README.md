# Crowdfund on Ethereum Sepolia

This project is an all-or-nothing crowdfunding DApp. The Solidity contract is the authority for campaign rules and funds; the Next.js frontend reads its state and sends user-approved transactions through an injected browser wallet such as MetaMask.

## Smart contract

`Crowdfund.sol` stores the campaign owner, funding goal, deadline, and contributions. Contributors can give ETH while the campaign is active. Once it ends, the owner can withdraw if the goal was reached; otherwise each contributor can refund their own recorded contribution.

The repository initially did not contain `Crowdfund.sol`. The frontend ABI in `src/lib/contract.ts` is derived from the exact contract provided in the project request. Do not alter the contract to use this frontend.

## Frontend

The frontend uses Next.js, React, TypeScript, Tailwind CSS, and viem. It targets Ethereum Sepolia only. Reads use a public Sepolia RPC; writes use the connected browser wallet. No private keys or seed phrases are requested or stored.

## Local setup

```bash
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_CROWDFUND_CONTRACT_ADDRESS in .env.local
npm run dev
```

Open http://localhost:3000. MetaMask should be connected to Ethereum Sepolia and funded with Sepolia test ETH for transactions.

## Environment

Set `NEXT_PUBLIC_CROWDFUND_CONTRACT_ADDRESS` to the existing deployed contract address on Sepolia. `NEXT_PUBLIC_SEPOLIA_RPC_URL` may be set to a Sepolia RPC URL; if omitted, the app uses the public Sepolia RPC at `https://ethereum-sepolia-rpc.publicnode.com`. Both values are public configuration. Never put a private key or seed phrase in an environment variable.

## Network

All reads, wallet checks, network switching, and Etherscan transaction links target Ethereum Sepolia. The app does not silently switch to or use mainnet.

## Build and deploy

```bash
npm run build
```

To deploy the frontend to Vercel, import this project and set these Environment Variables for the desired deployment environments:

```text
NEXT_PUBLIC_CROWDFUND_CONTRACT_ADDRESS=<your existing deployed Sepolia contract address>
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

The RPC variable is optional because the frontend has a public fallback. Redeploy after changing an environment variable.

## Deploy the contract manually with Remix

1. Open Remix and create `Crowdfund.sol` with the exact Solidity source supplied for this project.
2. Compile with Solidity compiler version 0.8.20 or a compatible 0.8.x compiler.
3. In MetaMask, select Ethereum Sepolia and ensure the wallet has Sepolia test ETH for deployment gas.
4. In Remix's Deploy & Run Transactions panel, choose **Injected Provider - MetaMask** and confirm it reports Sepolia.
5. Select `Crowdfund`, enter constructor arguments: `_goalInWei` (the goal denominated in wei) and `_durationInMinutes` (campaign length in minutes), then click **Deploy**.
6. Confirm the deployment in MetaMask. Copy the deployed contract address from Remix's Deployed Contracts area.
7. Put that address in `.env.local` as `NEXT_PUBLIC_CROWDFUND_CONTRACT_ADDRESS=0x...`, restart `npm run dev`, and set the same variable in Vercel before deploying the frontend.

Deployed Contract Address:
`<ADD_SEPOLIA_CONTRACT_ADDRESS_HERE>`
