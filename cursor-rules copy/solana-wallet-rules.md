# Solana Wallet Integration - OilWars Implementation

**This document describes the EXACT wallet integration used in OilWars - proven to work in production.**

## ✅ Verified Stack

**Dependencies (from `package.json`):**
```json
{
  "@solana-mobile/mobile-wallet-adapter-protocol-web3js": "^0.9.9",
  "@solana-mobile/wallet-standard-mobile": "^0.4.4",
  "@solana/wallet-adapter-base": "^0.9.23",
  "@solana/wallet-adapter-react": "^0.15.35",
  "@solana/wallet-adapter-react-ui": "^0.9.35",
  "@solana/web3.js": "^1.95.2"
}
```

**Install command:**
```bash
npm install @solana/wallet-adapter-react @solana/wallet-adapter-react-ui @solana/wallet-adapter-base @solana/web3.js @solana-mobile/wallet-standard-mobile @solana-mobile/mobile-wallet-adapter-protocol-web3js
```

## Provider Setup

### WalletProvider.tsx

**Location:** `OilWars/frontend/app/components/WalletProvider.tsx`

```typescript
'use client';

import { useMemo, useEffect } from 'react';
import { ConnectionProvider, WalletProvider as SolanaWalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from '@solana-mobile/wallet-standard-mobile';

import '@solana/wallet-adapter-react-ui/styles.css';

function getOrigin() {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://www.oilwars.fun';
  }
  return window.location.origin;
}

interface WalletProviderProps {
  children: React.ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const origin = getOrigin();
  const network = (process.env.NEXT_PUBLIC_SOLANA_NETWORK as WalletAdapterNetwork) || WalletAdapterNetwork.Devnet;
  
  // CRITICAL: Register Mobile Wallet Adapter for Android Chrome
  // This MUST be called in a non-SSR context (client-side only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Check if we're on Android Chrome
    const isAndroid = /Android/i.test(navigator.userAgent);
    const isChrome = /Chrome/i.test(navigator.userAgent) && !/Edg|OPR|Samsung/i.test(navigator.userAgent);
    
    if (isAndroid && isChrome) {
      try {
        registerMwa({
          appIdentity: {
            name: 'Oil Wars',
            uri: origin,
            icon: '/oildrop.png',
          },
          authorizationCache: createDefaultAuthorizationCache(),
          chains: ['solana:mainnet', 'solana:devnet'],
          chainSelector: createDefaultChainSelector(),
          onWalletNotFound: createDefaultWalletNotFoundHandler(),
        });
        console.log('Mobile Wallet Adapter registered for Android Chrome');
      } catch (error) {
        console.error('Failed to register Mobile Wallet Adapter:', error);
      }
    }
  }, [origin]);
  
  const endpoint = useMemo(() => {
    if (network === WalletAdapterNetwork.Mainnet) {
      return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    }
    return process.env.NEXT_PUBLIC_SOLANA_RPC_URL || clusterApiUrl(network);
  }, [network]);

  // Use empty array - Wallet Standard will automatically detect wallets like Phantom and Solflare
  // MWA registration makes mobile wallets available via Wallet Standard
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}
```

**Key Points:**
- ✅ MWA registration **only** on Android Chrome (not iOS, not desktop)
- ✅ Must check `typeof window === 'undefined'` to prevent SSR errors
- ✅ Empty wallets array - Wallet Standard auto-detects wallets
- ✅ MWA registration makes mobile wallets available via Wallet Standard
- ✅ Wrap app in root layout: `<WalletProvider>{children}</WalletProvider>`

## Using Wallet in Components

### Basic Wallet Usage

```typescript
'use client';

import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

export default function MyComponent() {
  const { publicKey, connected, wallet, disconnect } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();

  const handleConnect = () => {
    setVisible(true);
  };

  const handleDisconnect = () => {
    disconnect();
  };

  return (
    <div>
      {connected && publicKey ? (
        <div>
          <p>Connected: {publicKey.toString()}</p>
          <button onClick={handleDisconnect}>Disconnect</button>
        </div>
      ) : (
        <button onClick={handleConnect}>Connect Wallet</button>
      )}
    </div>
  );
}
```

**Hooks Available:**
- `useWallet()` - Returns `{ publicKey, connected, wallet, disconnect, connecting, ... }`
- `useConnection()` - Returns `{ connection }`
- `useWalletModal()` - Returns `{ setVisible, visible }`

## Transaction Signing

### Transaction Utility

**Location:** `OilWars/frontend/app/utils/transactions.ts`

```typescript
import { Transaction, Connection } from '@solana/web3.js';
import { signThenSend } from '../lib/solana/mobile-transaction-signer';
import { isMobileDevice, isAndroidChrome } from '../lib/solana/mobile-wallet-utils';

/**
 * Sign and send a transaction from the backend
 * Uses mobile-safe pattern on mobile devices, standard pattern on desktop
 */
export async function signAndSendTransaction(
  base64Transaction: string,
  connection: Connection,
  wallet: any
): Promise<string> {
  // Detect if we're on mobile (especially Android Chrome with MWA)
  const isMobile = isMobileDevice();
  const isAndroid = isAndroidChrome();
  
  // CRITICAL: On mobile (especially Android Chrome), use mobile-safe pattern
  // This uses signTransaction() + sendRawTransaction() instead of signAndSendTransaction()
  // Mobile wallets have flaky return paths after app-switching
  if (isMobile && isAndroid) {
    try {
      return await signThenSend({
        wallet,
        connection,
        base64Tx: base64Transaction,
        isV0: false,
        refreshBlockhash: true, // CRITICAL: Always refresh blockhash for mobile
      });
    } catch (error: any) {
      // Re-throw errors from signThenSend (they're already user-friendly)
      throw error;
    }
  }
  
  // Desktop or non-Android mobile: Use standard pattern
  const txBytes = Uint8Array.from(atob(base64Transaction), c => c.charCodeAt(0));
  const transaction = Transaction.from(txBytes);

  // Preserve feePayer before refreshing blockhash
  const originalFeePayer = transaction.feePayer;

  // Detect wallet adapter pattern
  let walletToUse: any = null;
  
  if (wallet?.signTransaction && typeof wallet.signTransaction === 'function') {
    walletToUse = wallet;
  } else if ((wallet as any)?.adapter?.signTransaction) {
    walletToUse = (wallet as any).adapter;
  } else if ((wallet as any)?.wallet?.adapter?.signTransaction) {
    walletToUse = (wallet as any).wallet.adapter;
  } else if ((wallet as any)?.wallet?.signTransaction) {
    walletToUse = (wallet as any).wallet;
  } else if (typeof window !== 'undefined' && (window as any).solana?.isPhantom && (window as any).solana?.signTransaction) {
    walletToUse = (window as any).solana;
  }

  // Refresh blockhash (use 'finalized' for mobile, 'confirmed' for desktop)
  const commitment = isMobile ? 'finalized' : 'confirmed';
  let latestBlockhash: { blockhash: string; lastValidBlockHeight: number };
  try {
    latestBlockhash = await connection.getLatestBlockhash(commitment);
    transaction.recentBlockhash = latestBlockhash.blockhash;
    transaction.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
    
    // CRITICAL: Restore feePayer after blockhash refresh
    if (originalFeePayer) {
      transaction.feePayer = originalFeePayer;
    }
  } catch (error) {
    console.warn('Failed to refresh blockhash, using existing:', error);
    latestBlockhash = await connection.getLatestBlockhash(commitment);
  }

  // Validate transaction before signing
  if (!transaction.recentBlockhash) {
    throw new Error('Transaction missing blockhash. Cannot sign transaction.');
  }

  if (!transaction.feePayer) {
    throw new Error('Transaction missing feePayer. Cannot sign transaction.');
  }

  // Sign transaction
  let signed: Transaction | null = null;
  
  if (walletToUse?.signTransaction) {
    try {
      signed = await walletToUse.signTransaction(transaction);
    } catch (error: any) {
      // Handle user rejection
      if (error.code === 4001 || error.message?.includes('rejected') || error.message?.includes('User rejected')) {
        throw new Error('Transaction rejected by user');
      }
      // Handle connection issues
      if (error.message?.includes('not connected') || error.message?.includes('not authorized')) {
        throw new Error('Wallet not connected. Please connect your wallet first.');
      }
      throw error;
    }
  }
  // Try Wallet Standard (separate flow as it uses different API)
  else if (wallet?.features?.['standard:signTransaction']) {
    const signFeature = wallet.features['standard:signTransaction'];
    try {
      const signedMessage = await signFeature.signTransaction({
        message: transaction.serializeMessage(),
      });
      signed = Transaction.from(signedMessage);
    } catch (error: any) {
      if (error.code === 4001 || error.message?.includes('rejected')) {
        throw new Error('Transaction rejected by user');
      }
      throw error;
    }
  }
  
  if (!signed) {
    throw new Error('Wallet does not support transaction signing. Please ensure your wallet is connected.');
  }

  // Verify signature before sending
  if (!signed.signatures || signed.signatures.length === 0) {
    throw new Error('Transaction was not signed properly - no signatures found');
  }

  const hasValidSignature = signed.signatures.some(sig => 
    sig.signature !== null && 
    sig.signature !== undefined && 
    sig.signature.length > 0
  );

  if (!hasValidSignature) {
    throw new Error('Transaction was not signed properly - signatures are empty');
  }

  // Send transaction
  let signature: string;
  try {
    signature = await connection.sendRawTransaction(
      signed.serialize(),
      {
        skipPreflight: false,
        maxRetries: 3,
      }
    );
  } catch (error: any) {
    if (error.message?.includes('blockhash')) {
      throw new Error('Transaction failed: Blockhash expired. Please try again.');
    }
    if (error.message?.includes('insufficient funds')) {
      throw new Error('Transaction failed: Insufficient funds for transaction fee.');
    }
    throw new Error(`Transaction failed to send: ${error.message || 'Unknown error'}`);
  }

  // Confirm transaction
  try {
    await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      'confirmed'
    );
  } catch (error: any) {
    // If confirmation fails, check if transaction was actually successful
    const status = await connection.getSignatureStatus(signature);
    if (status.value?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
    }
    console.warn('Transaction confirmation check failed, but transaction may still be processing:', error);
  }

  return signature;
}
```

### Mobile Transaction Signer

**Location:** `OilWars/frontend/app/lib/solana/mobile-transaction-signer.ts`

This utility handles mobile-safe transaction signing using `signTransaction()` + `sendRawTransaction()` pattern instead of `signAndSendTransaction()`.

**Key Points:**
- ✅ **Never use `signAndSendTransaction()` on mobile** - it's unreliable after app-switching
- ✅ **Always refresh blockhash** with `'finalized'` commitment before signing (gives ~32 seconds validity)
- ✅ Use `signTransaction()` then `sendRawTransaction()` separately
- ✅ Handle multiple wallet adapter paths
- ✅ Verify signatures before sending
- ✅ Use browser-native base64 conversion (no Buffer)

### Mobile Wallet Utilities

**Location:** `OilWars/frontend/app/lib/solana/mobile-wallet-utils.ts`

```typescript
/**
 * Detects if the current environment is a mobile device
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Detects if we're on Android Chrome (best support for MWA)
 */
export function isAndroidChrome(): boolean {
  if (typeof window === 'undefined') return false;
  const isAndroid = /Android/i.test(navigator.userAgent);
  const isChrome = /Chrome/i.test(navigator.userAgent) && !/Edg|OPR|Samsung/i.test(navigator.userAgent);
  return isAndroid && isChrome;
}

/**
 * Ensures wallet is ready for transaction signing
 */
export async function ensureWalletReady(
  connected: boolean,
  publicKey: string | null,
  wallet: any,
  walletName?: string
): Promise<{ ready: boolean; error?: string }> {
  if (!connected || !publicKey) {
    return {
      ready: false,
      error: 'Wallet is not connected. Please connect your wallet first.'
    };
  }

  const isMobile = isMobileDevice();
  const isMobileWalletType = isMobileWallet(walletName);

  // For mobile wallets, check if wallet adapter exists and has required methods
  if (isMobile || isMobileWalletType) {
    if (!wallet) {
      return {
        ready: false,
        error: 'Mobile wallet is not ready for transactions. The wallet app may have closed. Please:\n1. Ensure your wallet app (Phantom) is open and unlocked\n2. Return to this page\n3. Try the transaction again'
      };
    }
    
    // Check if wallet has signTransaction method (direct or via adapter)
    const hasSignMethod = 
      (wallet?.signTransaction && typeof wallet.signTransaction === 'function') ||
      ((wallet as any)?.adapter?.signTransaction && typeof (wallet as any).adapter.signTransaction === 'function') ||
      ((wallet as any)?.wallet?.adapter?.signTransaction && typeof (wallet as any).wallet.adapter.signTransaction === 'function') ||
      ((wallet as any)?.wallet?.signTransaction && typeof (wallet as any).wallet.signTransaction === 'function');
    
    if (!hasSignMethod) {
      return {
        ready: false,
        error: 'Mobile wallet is not ready for transactions. Please ensure your wallet app is open and unlocked.'
      };
    }
    
    return { ready: true };
  }

  // For desktop wallets, check if wallet exists
  if (!wallet) {
    return {
      ready: false,
      error: 'Wallet is not ready for transactions. Please ensure your wallet is unlocked.'
    };
  }

  return { ready: true };
}
```

## Transaction Flow Pattern

### Complete Example

```typescript
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { signAndSendTransaction } from '../utils/transactions';

export default function PurchaseComponent() {
  const { publicKey, connected, wallet } = useWallet();
  const { connection } = useConnection();

  const handlePurchase = async () => {
    if (!publicKey || !connected || !wallet) {
      throw new Error('Wallet not connected');
    }

    try {
      // Step 1: Get transaction from backend
      const txResponse = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ publicKey: publicKey.toString(), itemId: 'item123' }),
      });
      const txData = await txResponse.json();
      
      if (!txData.transaction) {
        throw new Error('Failed to get transaction from backend');
      }

      // Step 2: Sign and send transaction
      const signature = await signAndSendTransaction(
        txData.transaction,
        connection,
        wallet || (typeof window !== 'undefined' && (window as any).solana ? (window as any).solana : null)
      );

      // Step 3: Confirm with backend
      const confirmResponse = await fetch('/api/purchase/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          publicKey: publicKey.toString(), 
          itemId: 'item123',
          signature 
        }),
      });
      const confirmData = await confirmResponse.json();
      
      if (confirmData.success) {
        console.log('Purchase successful!');
      } else {
        throw new Error('Purchase confirmation failed');
      }
    } catch (err) {
      console.error('Purchase failed:', err);
      throw err;
    }
  };

  return <button onClick={handlePurchase}>Purchase</button>;
}
```

## Critical Implementation Details

### Blockhash Refresh Strategy

**Why it's critical:**
1. Backend creates transaction with blockhash at time T0
2. User takes 5-30 seconds to approve in wallet app
3. Blockhash expires (~60 seconds validity)
4. Transaction fails with "Blockhash not found"

**Solution:**
```typescript
// ALWAYS refresh blockhash RIGHT BEFORE signing
// Use 'finalized' commitment for longer validity (~32 seconds) on mobile
// Use 'confirmed' commitment for faster response (~100ms) on desktop
const commitment = isMobile ? 'finalized' : 'confirmed';
const { blockhash, lastValidBlockHeight } = 
  await connection.getLatestBlockhash(commitment);
tx.recentBlockhash = blockhash;
tx.lastValidBlockHeight = lastValidBlockHeight;
```

**When to refresh:**
- ✅ **DO refresh** before signing transactions from backend
- ✅ **DO refresh** for all mobile wallet transactions
- ❌ **DON'T refresh** for partially signed transactions (treasury already signed with original blockhash)

### Signing Pattern Differences

**Desktop (works fine):**
```typescript
// Can use signTransaction() + sendRawTransaction()
const signed = await wallet.signTransaction(tx);
const sig = await connection.sendRawTransaction(signed.serialize());
```

**Mobile (MUST use this):**
```typescript
// MUST use signTransaction() + sendRawTransaction()
// NEVER use signAndSendTransaction() - flaky return paths after app-switching
const signed = await wallet.signTransaction(tx);
const sig = await connection.sendRawTransaction(signed.serialize());
```

### Wallet Adapter Paths

Wallet adapters can be wrapped in different ways. The transaction utility checks multiple paths:

```typescript
// Path 1: Direct
wallet.signTransaction()

// Path 2: Adapter pattern
wallet.adapter.signTransaction()

// Path 3: Nested wrapping
wallet.wallet.adapter.signTransaction()

// Path 4: Another pattern
wallet.wallet.signTransaction()

// Path 5: Window.solana (Phantom direct)
window.solana.signTransaction()
```

### Error Handling

**Common wallet errors:**

```typescript
// User rejection
if (error.code === 4001 || error.message?.includes('rejected')) {
  throw new Error('Transaction rejected by user');
}

// Wallet not detected (app closed)
if (error.message?.includes('not detected')) {
  throw new Error('Could not detect your wallet. Please:\n1. Open your Phantom wallet app\n2. Keep it open and unlocked\n3. Try again');
}

// Blockhash expired
if (error.message?.includes('Blockhash not found')) {
  throw new Error('Transaction expired. Please try again.');
}
```

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_NETWORK=devnet  # or mainnet-beta
NEXT_PUBLIC_APP_URL=https://www.oilwars.fun  # Optional, for MWA registration
NEXT_PUBLIC_SITE_URL=https://www.oilwars.fun  # Optional, fallback for MWA registration
```

## Best Practices

### Wallet Connection
- Always check `connected` state before wallet operations
- Handle wallet disconnection gracefully
- Show loading states during connection
- Handle user rejection of connection requests
- Use `useWalletModal()` for consistent wallet selection UI

### Transaction Handling
- Always validate wallet connection before transactions
- Refresh blockhash before signing (critical for mobile wallets)
- Handle user rejection gracefully (error code 4001)
- Show loading states during transaction processing
- Verify transaction signatures before sending
- Confirm transactions after sending
- Always confirm with backend after successful transaction

### Error Handling
- Wrap wallet operations in try/catch blocks
- Provide clear error messages to users
- Log errors appropriately (without sensitive data)
- Handle network failures gracefully
- Check for specific error codes (4001 = user rejection)

### Security
- Never store private keys in your application
- Always validate transactions before sending
- Use proper network configuration (devnet vs mainnet)
- Validate all public keys before use
- Implement transaction confirmation dialogs
- Use environment variables for RPC endpoints

### Mobile Support
- Register Mobile Wallet Adapter for Android Chrome only
- Use mobile-safe transaction signing pattern (`signTransaction()` + `sendRawTransaction()`)
- Always refresh blockhash with `'finalized'` commitment on mobile
- Handle app-switching gracefully
- Test on actual mobile devices

## File Structure

```
frontend/
├── app/
│   ├── components/
│   │   └── WalletProvider.tsx          # MWA registration + Wallet Adapter setup
│   ├── lib/
│   │   └── solana/
│   │       ├── mobile-transaction-signer.ts  # signThenSend function
│   │       └── mobile-wallet-utils.ts         # Detection utilities
│   └── utils/
│       └── transactions.ts              # signAndSendTransaction utility
└── layout.tsx                           # Wrap app with WalletProvider
```

## Summary

**The exact process that works:**

1. **Register MWA** in `WalletProvider` (Android Chrome only)
2. **Use Wallet Adapter** with empty wallets array (auto-detection)
3. **Use `useWallet()`, `useConnection()`, `useWalletModal()`** hooks
4. **Use `signTransaction()` + `sendRawTransaction()`** pattern (never `signAndSendTransaction()` on mobile)
5. **Always refresh blockhash** with appropriate commitment (`'finalized'` for mobile, `'confirmed'` for desktop)
6. **Handle multiple wallet adapter paths** (wrappers vary)
7. **Check wallet readiness** before signing
8. **Show actual error messages** to users

This architecture ensures reliable transaction signing on mobile devices (Android Chrome) while maintaining compatibility with desktop wallets.
