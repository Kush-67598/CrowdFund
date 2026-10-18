'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createWalletClient, custom, formatEther, isAddress, parseEther, type Address, type Hash } from 'viem';
import { contractAddress, crowdfundAbi, publicClient, sepolia } from '@/lib/contract';

declare global { interface Window { ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (event: string, cb: (...args: unknown[]) => void) => void; removeListener?: (event: string, cb: (...args: unknown[]) => void) => void } } }
type Campaign = { owner: Address; goal: bigint; deadline: bigint; totalRaised: bigint; withdrawn: boolean; contribution: bigint };
type TxState = { label: string; hash?: Hash } | null;
const short = (a?: string) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '—';
const eth = (n?: bigint) => {
  if (n === undefined) return '—';
  const [whole, fraction = ''] = formatEther(n).split('.');
  return `${BigInt(whole).toLocaleString()}${fraction ? `.${fraction.slice(0, 5).replace(/0+$/, '')}` : ''}`;
};
const enteredWei = (value: string): bigint | undefined => {
  try { const parsed = parseEther(value); return parsed > 0n ? parsed : undefined; }
  catch { return undefined; }
};
const explainError = (e: unknown) => {
  const x = e as { shortMessage?: string; message?: string; name?: string };
  const msg = `${x?.shortMessage ?? ''} ${x?.message ?? ''}`.toLowerCase();
  if (msg.includes('user rejected') || msg.includes('denied transaction')) return 'Transaction cancelled by user.';
  if (msg.includes('campaign ended')) return 'This campaign has ended; contributions are closed.';
  if (msg.includes('still running')) return 'The campaign deadline has not passed yet.';
  if (msg.includes('goal not met')) return 'The funding goal was not reached, so withdrawal is unavailable.';
  if (msg.includes('goal was met')) return 'The goal was reached; refunds are unavailable.';
  if (msg.includes('not owner')) return 'Only the campaign owner can withdraw funds.';
  if (msg.includes('already withdrawn')) return 'Funds have already been withdrawn.';
  if (msg.includes('nothing to refund')) return 'This wallet has no contribution to refund.';
  if (msg.includes('insufficient funds')) return 'Insufficient ETH for this transaction and its gas fee.';
  return x?.shortMessage ?? x?.message ?? 'Blockchain request failed. Check your wallet and Sepolia connection.';
};

export default function Home() {
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [campaign, setCampaign] = useState<Campaign>();
  const [walletBalance, setWalletBalance] = useState<bigint>();
  const [amount, setAmount] = useState('0.01');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tx, setTx] = useState<TxState>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [connectionMessage, setConnectionMessage] = useState('');

  const refresh = useCallback(async (who = account) => {
    if (!contractAddress) { setLoading(false); return; }
    setLoading(true);
    try {
      const [owner, goal, deadline, totalRaised, withdrawn, contribution] = await Promise.all([
        publicClient.readContract({ address: contractAddress, abi: crowdfundAbi, functionName: 'owner' }),
        publicClient.readContract({ address: contractAddress, abi: crowdfundAbi, functionName: 'goal' }),
        publicClient.readContract({ address: contractAddress, abi: crowdfundAbi, functionName: 'deadline' }),
        publicClient.readContract({ address: contractAddress, abi: crowdfundAbi, functionName: 'totalRaised' }),
        publicClient.readContract({ address: contractAddress, abi: crowdfundAbi, functionName: 'withdrawn' }),
        who ? publicClient.readContract({ address: contractAddress, abi: crowdfundAbi, functionName: 'contributions', args: [who] }) : Promise.resolve(0n),
      ]);
      setCampaign({ owner, goal, deadline, totalRaised, withdrawn, contribution });
      setError('');
    } catch (e) { console.error('Unable to read Crowdfund state:', e); setError(`Could not read the configured contract. Check the address and Sepolia RPC. ${explainError(e)}`); }
    finally { setLoading(false); }
  }, [account]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(id); }, []);
  useEffect(() => {
    const ethp = window.ethereum;
    if (!ethp) return;
    const accountsChanged = (...args: unknown[]) => { const list = args[0] as string[]; setAccount(list?.[0] && isAddress(list[0]) ? list[0] : undefined); };
    const chainChanged = (...args: unknown[]) => { const id = args[0]; setChainId(typeof id === 'string' ? Number.parseInt(id, 16) : undefined); };
    ethp.on?.('accountsChanged', accountsChanged); ethp.on?.('chainChanged', chainChanged);
    void ethp.request({ method: 'eth_chainId' }).then((id) => setChainId(Number.parseInt(String(id), 16))).catch(() => undefined);
    void ethp.request({ method: 'eth_accounts' }).then((list) => { const a = list as string[]; if (a?.[0] && isAddress(a[0])) setAccount(a[0]); }).catch(() => undefined);
    return () => { ethp.removeListener?.('accountsChanged', accountsChanged); ethp.removeListener?.('chainChanged', chainChanged); };
  }, []);
  useEffect(() => { if (account && chainId === sepolia.id) void publicClient.getBalance({ address: account }).then(setWalletBalance).catch(() => setWalletBalance(undefined)); else setWalletBalance(undefined); }, [account, chainId, campaign?.totalRaised]);

  const ended = campaign ? BigInt(Math.floor(now / 1000)) >= campaign.deadline : false;
  const status = !campaign ? '—' : !ended ? 'ACTIVE' : campaign.totalRaised >= campaign.goal ? 'SUCCESSFUL' : 'FAILED';
  const owner = !!account && !!campaign && account.toLowerCase() === campaign.owner.toLowerCase();
  const wrongNetwork = !!account && chainId !== undefined && chainId !== sepolia.id;
  const pct = campaign && campaign.goal > 0n ? Math.min(100, Number((campaign.totalRaised * 10000n) / campaign.goal) / 100) : 0;
  const secondsLeft = campaign ? Math.max(0, Number(campaign.deadline) - Math.floor(now / 1000)) : 0;
  const countdown = `${Math.floor(secondsLeft / 3600)}h ${Math.floor((secondsLeft % 3600) / 60)}m remaining`;
  const amountWei = enteredWei(amount);
  const canContribute = !!account && chainId === sepolia.id && !!campaign && !ended && amountWei !== undefined && walletBalance !== undefined && walletBalance >= amountWei;
  const canRefund = !!account && chainId === sepolia.id && !!campaign && ended && campaign.totalRaised < campaign.goal && campaign.contribution > 0n;
  const canWithdraw = owner && !!campaign && ended && campaign.totalRaised >= campaign.goal && !campaign.withdrawn && chainId === sepolia.id;

  async function connect() {
    setError(''); setConnectionMessage('');
    if (!window.ethereum) { setConnectionMessage('MetaMask or another injected wallet is not installed. Install MetaMask and reload this page.'); return; }
    try { setBusy(true); setConnectionMessage('Connecting wallet...'); const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' }) as string[]; const id = await window.ethereum.request({ method: 'eth_chainId' }); setAccount(accounts[0] as Address); setChainId(Number.parseInt(String(id), 16)); setConnectionMessage(''); await refresh(accounts[0] as Address); }
    catch (e) { setConnectionMessage(explainError(e)); } finally { setBusy(false); }
  }
  async function switchNetwork() {
    try { await window.ethereum?.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xaa36a7' }] }); }
    catch (e) { console.error('Network switch failed:', e); setError(`Could not switch network: ${explainError(e)}`); }
  }
  async function transact(method: 'contribute' | 'refund' | 'withdraw') {
    if (!window.ethereum || !account || !contractAddress) { setError(!window.ethereum ? 'Install MetaMask or another injected wallet to continue.' : !contractAddress ? 'The deployed contract address is not configured correctly.' : 'Connect your wallet to continue.'); return; }
    if (chainId !== sepolia.id) { setError('Switch your wallet to Ethereum Sepolia before sending a transaction.'); return; }
    if (method === 'contribute' && !amountWei) { setError('Enter a valid ETH amount greater than zero.'); return; }
    if (method === 'contribute' && walletBalance !== undefined && amountWei! > walletBalance) { setError('Your wallet balance is too low for this contribution, before gas.'); return; }
    setBusy(true); setError(''); setTx({ label: 'Preparing transaction...' });
    try {
      const wallet = createWalletClient({ account, chain: sepolia, transport: custom(window.ethereum) });
      setTx({ label: 'Confirm in MetaMask...' });
      const hash = method === 'contribute'
        ? await wallet.writeContract({ address: contractAddress, abi: crowdfundAbi, functionName: 'contribute', value: amountWei! })
        : await wallet.writeContract({ address: contractAddress, abi: crowdfundAbi, functionName: method });
      setTx({ label: 'Transaction pending...', hash });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('Transaction reverted on Sepolia.');
      setTx({ label: 'Transaction confirmed!', hash });
      await refresh(account);
    } catch (e) { console.error(`${method} transaction failed:`, e); setError(explainError(e)); setTx(null); }
    finally { setBusy(false); }
  }

  return <main>
    <header style={{ borderBottom: '1px solid #e6eae7', background: '#fff' }}><div className="shell" style={{ minHeight: 76, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><div style={{ width: 38, height: 38, borderRadius: 12, background: '#e4f1e9', display: 'grid', placeItems: 'center', color: '#176b4b', fontWeight: 900 }}>C</div><div><div style={{ fontWeight: 800, letterSpacing: '-.02em' }}>Crowdfund</div><div className="muted" style={{ fontSize: 12 }}>All or nothing · Ethereum Sepolia</div></div></div>
      {account ? <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', justifyContent: 'end' }}><div style={{ textAlign: 'right', fontSize: 12 }}><div className="muted">Wallet</div><div className="mono" style={{ fontWeight: 700 }}>{short(account)}</div></div><div style={{ textAlign: 'right', fontSize: 12 }}><div className="muted">Network</div><div style={{ fontWeight: 700, color: wrongNetwork ? '#b45309' : '#176b4b' }}>{wrongNetwork ? 'Wrong Network' : chainId === sepolia.id ? 'Sepolia' : 'Checking...'}</div></div></div> : <button className="primary" disabled={busy} onClick={() => void connect()}>{busy ? 'Connecting...' : 'Connect Wallet'}</button>}
    </div></header>

    <div className="shell" style={{ paddingTop: 38, paddingBottom: 64 }}>
      {wrongNetwork && <div role="alert" style={{ padding: 18, marginBottom: 20, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}><div><b>Wrong Network</b><div style={{ marginTop: 4 }}>Please switch your wallet to Ethereum Sepolia.</div></div><button className="outline" onClick={() => void switchNetwork()}>Switch to Sepolia</button></div>}
      {!contractAddress && <div role="status" style={{ padding: 18, marginBottom: 20, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14 }}><b>Contract address required</b><p style={{ margin: '6px 0 0' }}>Set <code>NEXT_PUBLIC_CROWDFUND_CONTRACT_ADDRESS</code> in <code>.env.local</code> to your deployed Sepolia contract address, then restart the dev server. Campaign values will appear after the contract can be read.</p></div>}
      <div style={{ marginBottom: 24 }}><div className="muted" style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase' }}>Sepolia Campaign</div><h1 style={{ fontSize: 'clamp(30px, 5vw, 44px)', letterSpacing: '-.045em', margin: '9px 0 8px' }}>Community Crowdfund</h1><p className="muted" style={{ margin: 0 }}>A transparent, all-or-nothing campaign secured by the Crowdfund smart contract.</p></div>
      {error && <div role="alert" style={{ padding: 14, marginBottom: 18, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 12 }}>{error}</div>}
      {connectionMessage && <div role="status" style={{ padding: 14, marginBottom: 18, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12 }}>{connectionMessage}</div>}
      {tx && <div role="status" style={{ padding: 14, marginBottom: 18, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 12 }}><b>{tx.label}</b>{tx.hash && <div style={{ marginTop: 5 }} className="mono"><a style={{ color: '#176b4b' }} target="_blank" rel="noreferrer" href={`https://sepolia.etherscan.io/tx/${tx.hash}`}>{short(tx.hash)} · View on Sepolia Etherscan ↗</a></div>}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(280px, .8fr)', gap: 18 }} className="overview-grid">
        <section className="card" style={{ padding: 'clamp(20px, 4vw, 32px)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h2 style={{ fontSize: 18, margin: 0 }}>Campaign overview</h2><span style={{ borderRadius: 999, padding: '7px 11px', background: status === 'ACTIVE' ? '#e7f5ec' : status === 'SUCCESSFUL' ? '#e0f2fe' : status === 'FAILED' ? '#fef2f2' : '#f1f5f2', color: status === 'FAILED' ? '#b91c1c' : '#176b4b', fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>{loading ? 'LOADING' : status}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', marginTop: 31, gap: 12 }}><div><div className="muted" style={{ fontSize: 13 }}>Total raised</div><div style={{ fontSize: 'clamp(30px, 5vw, 42px)', fontWeight: 800, letterSpacing: '-.04em', marginTop: 5 }}>{campaign ? eth(campaign.totalRaised) : '—'} <span style={{ fontSize: 16, fontWeight: 700 }}>ETH</span></div></div><div style={{ textAlign: 'right' }}><div className="muted" style={{ fontSize: 13 }}>Funding goal</div><div style={{ fontSize: 21, fontWeight: 750, marginTop: 5 }}>{campaign ? eth(campaign.goal) : '—'} ETH</div></div></div>
          <div style={{ height: 10, borderRadius: 10, background: '#edf1ee', marginTop: 23, overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', borderRadius: 10, background: '#26815a', transition: 'width .4s' }} /></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9, fontSize: 13 }}><span className="muted">{campaign ? `${eth(campaign.totalRaised)} ETH / ${eth(campaign.goal)} ETH` : 'Waiting for contract data'}</span><b style={{ color: '#176b4b' }}>{campaign ? `${pct}%` : '—'}</b></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 28, paddingTop: 22, borderTop: '1px solid #edf0ee' }}><div><div className="muted" style={{ fontSize: 12 }}>Campaign deadline</div><div style={{ fontWeight: 700, marginTop: 6 }}>{campaign ? new Date(Number(campaign.deadline) * 1000).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</div><div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{campaign ? ended ? 'Campaign ended' : countdown : ''}</div></div><div><div className="muted" style={{ fontSize: 12 }}>Campaign owner</div><div className="mono" style={{ fontWeight: 700, marginTop: 6 }}>{campaign ? short(campaign.owner) : '—'}</div>{owner && <div style={{ fontSize: 12, color: '#176b4b', marginTop: 4 }}>You are the campaign owner</div>}<div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Funds withdrawn</div><div style={{ fontWeight: 700, marginTop: 3 }}>{campaign ? campaign.withdrawn ? 'Yes' : 'No' : '—'}</div></div></div>
        </section>
        <section className="card" style={{ padding: 24 }}><h2 style={{ fontSize: 18, margin: '0 0 20px' }}>Your contribution</h2><div style={{ fontSize: 31, letterSpacing: '-.04em', fontWeight: 800 }}>{campaign && account ? eth(campaign.contribution) : '—'} <span style={{ fontSize: 15 }}>{campaign && account ? 'ETH' : ''}</span></div><p className="muted" style={{ fontSize: 13, lineHeight: 1.55, marginTop: 10 }}>{account ? 'Your recorded amount is read directly from the contract.' : 'Connect your wallet to view its recorded contribution.'}</p><div style={{ borderTop: '1px solid #edf0ee', marginTop: 20, paddingTop: 17 }}><div className="muted" style={{ fontSize: 12 }}>Wallet balance</div><div style={{ fontWeight: 700, marginTop: 5 }}>{account && walletBalance !== undefined ? `${eth(walletBalance)} ETH` : 'Connect wallet to view'}</div></div></section>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 18, marginTop: 18 }} className="action-grid">
        <section className="card" style={{ padding: 24 }}><h2 style={{ fontSize: 18, margin: '0 0 7px' }}>Contribute to campaign</h2><p className="muted" style={{ fontSize: 13, margin: '0 0 18px' }}>Send ETH to support the goal. Your contribution is recorded by wallet address.</p><label htmlFor="amount" style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Amount (ETH)</label><div style={{ position: 'relative' }}><input id="amount" className="input" type="number" min="0" step="any" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.01" /><span style={{ position: 'absolute', right: 14, top: 13, color: '#738078', fontSize: 13 }}>ETH</span></div>{account && walletBalance !== undefined && Number.isFinite(Number(amount)) && (() => { try { return parseEther(amount || '0') > walletBalance; } catch { return true; } })() && <div style={{ color: '#b91c1c', fontSize: 12, marginTop: 7 }}>Not enough ETH for this amount and gas.</div>}<button className="primary" style={{ width: '100%', marginTop: 14 }} disabled={!canContribute || busy || loading} onClick={() => void transact('contribute')}>{busy && tx?.label.includes('Preparing') ? 'Preparing...' : 'Contribute'}</button>{!account && <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Connect a Sepolia wallet to contribute.</div>}{account && ended && <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>The campaign has ended; contributions are closed.</div>}</section>
        <section className="card" style={{ padding: 24 }}><h2 style={{ fontSize: 18, margin: '0 0 7px' }}>Refund contribution</h2><p className="muted" style={{ fontSize: 13, margin: '0 0 19px', lineHeight: 1.55 }}>Refunds become available after the deadline only if the funding goal was not reached.</p><div style={{ background: '#f7f9f7', borderRadius: 12, padding: 15, marginBottom: 16 }}><div className="muted" style={{ fontSize: 12 }}>Refundable amount</div><b style={{ fontSize: 20, display: 'block', marginTop: 5 }}>{account && campaign ? eth(campaign.contribution) : '—'} ETH</b></div><button className="outline" style={{ width: '100%' }} disabled={!canRefund || busy} onClick={() => void transact('refund')}>Refund Contribution</button><div className="muted" style={{ fontSize: 12, marginTop: 10 }}>{campaign && !ended ? 'Available when the campaign ends unsuccessfully.' : campaign && campaign.totalRaised >= campaign.goal ? 'The goal was reached; refunds are unavailable.' : account && campaign?.contribution === 0n ? 'This wallet has no contribution to refund.' : 'Refund calls the contract directly; no ETH value is sent by you.'}</div></section>
      </div>
      {owner && <section className="card" style={{ padding: 24, marginTop: 18, borderColor: '#cfe2d6' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'start' }}><div><h2 style={{ fontSize: 18, margin: 0 }}>Owner controls</h2><p className="muted" style={{ margin: '7px 0 0', fontSize: 13 }}>Withdrawal is available only after the deadline if the goal is met, and only once.</p></div><span style={{ fontSize: 11, fontWeight: 800, padding: '7px 10px', background: '#e7f5ec', color: '#176b4b', borderRadius: 99 }}>OWNER WALLET</span></div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, margin: '20px 0' }}>{[['Goal reached', campaign && campaign.totalRaised >= campaign.goal], ['Campaign ended', ended], ['Already withdrawn', campaign?.withdrawn]].map(([label, yes]) => <div key={String(label)} style={{ padding: 12, background: '#f7f9f7', borderRadius: 11, fontSize: 13 }}><div className="muted">{label}</div><b style={{ display: 'block', marginTop: 5 }}>{yes ? '✓ Yes' : label === 'Already withdrawn' ? 'No' : '○ No'}</b></div>)}</div><button className="primary" disabled={!canWithdraw || busy} onClick={() => void transact('withdraw')}>{campaign?.withdrawn ? 'Funds already withdrawn' : 'Withdraw Funds'}</button>{!canWithdraw && !campaign?.withdrawn && <span className="muted" style={{ fontSize: 12, marginLeft: 12 }}>{!ended ? 'Available after the deadline.' : campaign && campaign.totalRaised < campaign.goal ? 'The goal was not met.' : 'Connect the owner wallet on Sepolia.'}</span>}</section>}
      {!owner && account && <div style={{ marginTop: 18, textAlign: 'right', fontSize: 12 }} className="muted">Owner controls are visible only to the campaign owner.</div>}
      <footer className="muted" style={{ marginTop: 24, fontSize: 12, textAlign: 'center' }}>Contract state is read from Ethereum Sepolia. The contract enforces all campaign rules.</footer>
    </div>
    <style jsx>{`@media(max-width:760px){.overview-grid,.action-grid{grid-template-columns:1fr!important}}`}</style>
  </main>;
}
