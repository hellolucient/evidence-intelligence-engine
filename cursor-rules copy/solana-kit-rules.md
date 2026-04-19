# Solana Wallet Integration - Complete Guide

**⚠️ IMPORTANT: This repository uses `@solana/wallet-adapter-react` (NOT ConnectorKit/Kit)**

**For OilWars implementation, see [solana-wallet-rules.md](./solana-wallet-rules.md)**

This document provides a comprehensive guide for Solana wallet integration. The OilWars project uses the **Wallet Adapter** approach, which is proven and stable.

## Quick Reference

| Project | Stack | Status |
|---------|-------|--------|
| **OilWars** | `@solana/wallet-adapter-react` + MWA | ✅ Production |
| **SolPonzi** | `@solana/connector` + `@solana/kit` | ⚠️ Legacy (not used in OilWars) |

## OilWars Implementation (Current)

**Use this approach for new Solana integrations:**

### Stack
- `@solana/wallet-adapter-react` - Core wallet adapter
- `@solana/wallet-adapter-react-ui` - Wallet modal UI
- `@solana-mobile/wallet-standard-mobile` - Mobile wallet support
- `@solana/web3.js` - Core Solana library

### Hooks
- `useWallet()` - Wallet connection state
- `useConnection()` - Solana connection
- `useWalletModal()` - Wallet selection modal

### See Full Documentation
👉 **[solana-wallet-rules.md](./solana-wallet-rules.md)** - Complete OilWars implementation guide

## Key Principles

### 1. Wallet Provider Setup

```typescript
// Use Wallet Adapter (NOT ConnectorKit)
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

// Register MWA for mobile (Android Chrome only)
import { registerMwa } from '@solana-mobile/wallet-standard-mobile';

// Empty wallets array - auto-detection via Wallet Standard
const wallets = useMemo(() => [], []);
```

### 2. Transaction Signing

**Mobile Pattern (Android Chrome):**
```typescript
// NEVER use signAndSendTransaction() on mobile
// Use signTransaction() + sendRawTransaction() instead
const signed = await wallet.signTransaction(transaction);
const signature = await connection.sendRawTransaction(signed.serialize());
```

**Desktop Pattern:**
```typescript
// Can use signTransaction() + sendRawTransaction()
const signed = await wallet.signTransaction(transaction);
const signature = await connection.sendRawTransaction(signed.serialize());
```

### 3. Blockhash Refresh

**Critical for mobile:**
```typescript
// Always refresh blockhash before signing
// Use 'finalized' for mobile (~32s validity)
// Use 'confirmed' for desktop (~100ms response)
const commitment = isMobile ? 'finalized' : 'confirmed';
const { blockhash, lastValidBlockHeight } = 
  await connection.getLatestBlockhash(commitment);
transaction.recentBlockhash = blockhash;
transaction.lastValidBlockHeight = lastValidBlockHeight;
```

### 4. Error Handling

```typescript
try {
  // Transaction signing
} catch (error: any) {
  // User rejection
  if (error.code === 4001 || error.message?.includes('rejected')) {
    throw new Error('Transaction rejected by user');
  }
  // Connection issues
  if (error.message?.includes('not connected')) {
    throw new Error('Wallet not connected. Please connect your wallet first.');
  }
  throw error;
}
```

## Common Patterns

### Transaction Builder Pattern

1. **Backend creates unsigned transaction** → Returns base64 encoded transaction
2. **Frontend signs transaction** → Uses `signAndSendTransaction` utility
3. **Frontend sends transaction** → Gets signature
4. **Backend confirms transaction** → Verifies signature and processes

### Wallet Detection

Wallet Adapter automatically detects:
- Wallet Standard wallets (Phantom, Solflare, etc.)
- Mobile wallets (via MWA registration)
- Extension wallets (via browser extensions)

### Transaction Flow

```typescript
// 1. Get transaction from backend
const txResponse = await fetch('/api/purchase', {
  method: 'POST',
  body: JSON.stringify({ publicKey, itemId }),
});
const { transaction } = await txResponse.json();

// 2. Sign and send
const signature = await signAndSendTransaction(
  transaction,
  connection,
  wallet
);

// 3. Confirm with backend
const confirmResponse = await fetch('/api/purchase/confirm', {
  method: 'POST',
  body: JSON.stringify({ publicKey, itemId, signature }),
});
```

## Best Practices

### ✅ DO

- Use `@solana/wallet-adapter-react` for new projects
- Register MWA for Android Chrome mobile support
- Refresh blockhash before signing transactions
- Use `signTransaction()` + `sendRawTransaction()` pattern on mobile
- Handle user rejection gracefully (error code 4001)
- Verify transaction signatures before sending
- Confirm transactions with backend after sending
- Use environment variables for RPC endpoints

### ❌ DON'T

- Don't use ConnectorKit/Kit for new OilWars features
- Don't use `signAndSendTransaction()` on mobile
- Don't skip blockhash refresh before signing
- Don't store private keys in your application
- Don't trust client-side data
- Don't expose sensitive data in error messages

## Environment Variables

```bash
# Required
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet  # or mainnet-beta

# Optional (for MWA registration)
NEXT_PUBLIC_APP_URL=https://www.oilwars.fun
NEXT_PUBLIC_SITE_URL=https://www.oilwars.fun
```

## Troubleshooting

### Wallet Not Connecting
- Check if wallet extension is installed (desktop)
- Check if MWA is registered (mobile Android Chrome)
- Verify `autoConnect` is set correctly in WalletProvider

### Transaction Failing
- Check if blockhash was refreshed before signing
- Verify wallet is connected and unlocked
- Check transaction fee payer has sufficient balance
- Verify transaction is not expired

### Mobile Issues
- Ensure MWA registration only happens on Android Chrome
- Use mobile-safe transaction signing pattern
- Refresh blockhash with `'finalized'` commitment
- Handle app-switching gracefully

## Additional Resources

- **[solana-wallet-rules.md](./solana-wallet-rules.md)** - Complete OilWars implementation
- **[seeker-integration-rules.md](./seeker-integration-rules.md)** - Seeker wallet integration
- [Solana Wallet Adapter Docs](https://github.com/solana-labs/wallet-adapter)
- [Mobile Wallet Adapter Docs](https://github.com/solana-mobile/mobile-wallet-adapter)
