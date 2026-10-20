# Crowdfund on Ethereum Sepolia

An all-or-nothing crowdfunding DApp. The web app reads campaign state from an existing Ethereum Sepolia contract and submits transactions through a user-connected browser wallet such as MetaMask. The contract is the authority for campaign rules and custody of funds; the frontend displays its state and guides the user through the available actions.

> **Contract source note:** This repository contains the Next.js frontend and a TypeScript ABI, but it does not contain `Crowdfund.sol`, Solidity build configuration, or contract deployment scripts. To deploy a contract, obtain the matching Solidity source separately. The ABI in `src/lib/contract.ts` documents the functions/events the frontend expects.

## Contents

- [Features](#features)
- [Campaign lifecycle](#campaign-lifecycle)
- [Technology](#technology)
- [Requirements](#requirements)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Using the app](#using-the-app)
- [Contract interface](#contract-interface)
- [Project structure](#project-structure)
- [Commands](#commands)
- [Build and deployment](#build-and-deployment)
- [Deploying a compatible contract](#deploying-a-compatible-contract)
- [Troubleshooting](#troubleshooting)
- [Security and limitations](#security-and-limitations)

## Features

- Reads the campaign owner, funding goal, deadline, total raised, withdrawal state, and connected wallet contribution.
- Displays campaign status, progress toward the goal, a live countdown, and the connected wallet's Sepolia balance.
- Connects to an injected wallet and listens for account and network changes.
- Lets a connected wallet contribute ETH while the campaign is active.
- Exposes refunds after an unsuccessful campaign and owner withdrawal after a successful one, subject to the contract's rules.
- Waits for transactions to be mined and links transaction hashes to Sepolia Etherscan.
- Restricts its public reads, wallet checks, and transactions to Ethereum Sepolia.

## Campaign lifecycle

The UI derives the campaign status from the on-chain deadline, total raised, and goal:

| State | Condition | Available action |
| --- | --- | --- |
| Active | Current time is before the deadline | Any connected Sepolia wallet may contribute a positive ETH amount. |
| Successful | Deadline has passed and total raised is at least the goal | The owner may withdraw, if funds have not already been withdrawn. Contributors cannot refund. |
| Failed | Deadline has passed and total raised is below the goal | A contributor with a recorded contribution may request a refund. The owner cannot withdraw. |

The UI checks these conditions to enable or disable controls. The smart contract must enforce them independently; the interface is not a security boundary.

## Technology

- Next.js 14 App Router and React 18
- TypeScript
- viem 2 for Ethereum reads, wallet writes, unit conversion, and transaction receipts
- Ethereum Sepolia (`chain ID 11155111`)
- Tailwind CSS 3 and a small set of global CSS rules

## Requirements

- Node.js compatible with the installed Next.js 14 release and npm
- A Sepolia RPC endpoint (optional; a public fallback is configured)
- MetaMask or another EIP-1193 injected browser wallet to connect and send transactions
- Sepolia test ETH for deployment, contribution, and transaction gas
- The address of a deployed compatible crowdfunding contract

## Local development

```bash
npm install
cp .env.example .env.local
```

Set the deployed contract address in `.env.local` (see [Configuration](#configuration)), then run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Connect a browser wallet configured for Sepolia to use transaction features. Without a configured contract address, the page displays a setup message and does not load campaign data.

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_CROWDFUND_CONTRACT_ADDRESS` | Yes for campaign data and transactions | Deployed contract address on Ethereum Sepolia. The frontend validates its shape as an Ethereum address, but does not verify the contract's bytecode or compatibility in advance. |
| `NEXT_PUBLIC_SEPOLIA_RPC_URL` | No | HTTP RPC URL used for public reads and waiting for transaction receipts. Defaults to `https://ethereum-sepolia-rpc.publicnode.com`. |

Example `.env.local`:

```dotenv
NEXT_PUBLIC_CROWDFUND_CONTRACT_ADDRESS=0xYourDeployedContractAddress
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
```

These variables are prefixed with `NEXT_PUBLIC_` and are bundled into the browser application. Only public configuration belongs here. **Never put a private key or seed phrase in these variables or in this repository.** Restart the dev server after changing environment variables. For a hosted deployment, configure them in the hosting provider and redeploy.

## Using the app

1. Open the app and connect an injected wallet. The app requests wallet access only after the user selects **Connect Wallet**.
2. Select Ethereum Sepolia in the wallet. If the wallet is on another chain, the page offers **Switch to Sepolia**.
3. Review the campaign goal, deadline, amount raised, and status shown from contract reads.
4. While the campaign is active, enter an amount in ETH and select **Contribute**. Review and approve the transaction in the wallet. The page waits for a Sepolia receipt and refreshes campaign data.
5. If the campaign ends below its goal, a wallet with a contribution can select **Refund Contribution**.
6. If the goal is met and the campaign has ended, the owner wallet can use **Withdraw Funds** once.

Transaction prompts and gas fees are handled by the connected wallet. A contribution amount must be positive and no greater than the wallet balance; the wallet also needs enough ETH to cover gas. The displayed balance check does not reserve gas, so the wallet may still reject a transaction whose amount leaves insufficient gas funds.

## Contract interface

The ABI is defined in `src/lib/contract.ts`. The connected deployed contract is expected to expose these public getters and methods:

| Function | Expected behavior/use |
| --- | --- |
| `owner() view returns (address)` | Campaign owner address; controls the owner panel and withdrawal eligibility. |
| `goal() view returns (uint256)` | Funding goal, interpreted as wei. |
| `deadline() view returns (uint256)` | Unix timestamp in seconds. |
| `totalRaised() view returns (uint256)` | Total contributed amount, in wei. |
| `withdrawn() view returns (bool)` | Whether the owner has already withdrawn. |
| `contributions(address) view returns (uint256)` | Amount contributed by a wallet, in wei. |
| `contribute() payable` | Records a contribution using the transaction's ETH value. |
| `refund()` | Refunds the caller's contribution after an unsuccessful campaign. |
| `withdraw()` | Transfers campaign funds to the owner after a successful campaign. |

The ABI also declares `Contributed(from, amount)`, `Withdrawn(amount)`, and `Refunded(to, amount)` events. The current UI does not subscribe to these events; it refreshes by reading contract state after its own transaction is confirmed and on page load/account changes.

The frontend does not include or compile the Solidity implementation. Before connecting a deployment, confirm that its functions, types, units, and state transition rules match this interface. A wrong address, network, ABI, or incompatible contract will cause reads or transactions to fail.

## Project structure

```text
.
├── src/
│   ├── app/
│   │   ├── globals.css       # Global styles, shared layout classes, responsive rules
│   │   ├── layout.tsx        # Root document and page metadata
│   │   └── page.tsx          # Client UI, wallet integration, state and actions
│   └── lib/
│       └── contract.ts       # Sepolia public client, contract address, ABI
├── .env.example              # Public environment variable template
├── next.config.mjs           # Next.js configuration
├── package.json              # Dependencies and npm scripts
├── postcss.config.mjs        # PostCSS/Tailwind processing
├── tailwind.config.ts        # Tailwind content paths and theme
└── tsconfig.json             # Strict TypeScript and @/* source alias
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js development server. |
| `npm run build` | Create a production build. |
| `npm run start` | Serve the production build; run `npm run build` first. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm run lint` | Run the configured Next.js lint command. |

## Build and deployment

Build locally with:

```bash
npm run build
```

To deploy the frontend to Vercel or another Next.js hosting provider:

1. Import this repository into the provider.
2. Configure `NEXT_PUBLIC_CROWDFUND_CONTRACT_ADDRESS` with the deployed Sepolia contract address.
3. Optionally set `NEXT_PUBLIC_SEPOLIA_RPC_URL` to a provider endpoint with suitable availability and rate limits.
4. Deploy or redeploy so the public variables are included in the build.

The app is configured for Sepolia. Its RPC client uses the Sepolia chain definition, the network switch request targets Sepolia, and transaction links point to Sepolia Etherscan. It is not a mainnet deployment configuration.

## Deploying a compatible contract

No Solidity source or contract deployment scripts are included here. If you have the matching `Crowdfund.sol` from the project materials, one manual option is Remix:

1. Open Remix and create/import the supplied `Crowdfund.sol` source. Do not infer or substitute a different contract based only on the frontend ABI.
2. Compile it using the Solidity version required by that source (the earlier project setup notes specified Solidity 0.8.20 or compatible 0.8.x; confirm against the actual source).
3. Connect MetaMask to Ethereum Sepolia and ensure it has Sepolia test ETH for deployment gas.
4. In Remix's Deploy & Run panel, choose **Injected Provider - MetaMask** and confirm the selected network is Sepolia.
5. Select `Crowdfund`, provide the constructor arguments required by the source. The expected project setup uses `_goalInWei` and `_durationInMinutes`; verify constructor names and units in the source.
6. Deploy and confirm the transaction in MetaMask. Copy the deployed address.
7. Set `NEXT_PUBLIC_CROWDFUND_CONTRACT_ADDRESS` to that address locally and in the frontend hosting environment, then restart or redeploy.

The address placeholder from the initial project notes is not a live deployment address. Replace it with the address of the compatible contract you deployed.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| “Contract address required” | Set a valid Sepolia address in `.env.local`, then restart the dev server. |
| Campaign data cannot be read | Check the address, ensure the contract is deployed on Sepolia and matches the expected ABI, and confirm the RPC endpoint is reachable. |
| Wallet is on the wrong network | Switch the wallet to Ethereum Sepolia and retry. The app does not submit writes on another chain. |
| Wallet connection fails or no wallet is found | Install/unlock an injected wallet in the browser and retry. Browser wallet access is required for transactions. |
| Transaction is rejected | Check wallet approval, account/network, test ETH balance for both value and gas, and whether the campaign state still permits the action. |
| Refund or withdrawal reverts | The contract enforces deadline, goal, caller, contribution, and one-time withdrawal rules. Check the current on-chain state and connected account. |
| Etherscan link does not show the transaction | Confirm the wallet submitted on Sepolia and allow time for indexing; the link is to Sepolia Etherscan. |

## Security and limitations

- The frontend never requests or stores wallet private keys. Signing occurs in the injected wallet.
- `NEXT_PUBLIC_` values are public. Do not store secrets in them.
- UI eligibility checks are for usability only; contract code must validate every caller, deadline, goal, and transfer condition.
- The frontend currently reads state on initial load and after its own confirmed transactions. It does not poll for external contributions or subscribe to contract events, so data can become stale until a refresh or another local transaction.
- The configured RPC fallback is a public service and may have rate limits or availability constraints. Set a suitable RPC URL for production use.
- The repository does not provide the Solidity source, an audit, deployment automation, or a verified live contract address. Review the actual contract and deployment before handling any real value. This app is configured for Sepolia test ETH.
