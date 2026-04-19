# Solana Seeker Integration Best Practices

## Overview
The Seeker is Solana Mobile's Web3 smartphone designed to provide native Solana blockchain integration. It features hardware-level security and native wallet capabilities.

## Seeker Features

### Seed Vault Wallet
- Native hardware wallet with fingerprint access
- Double-tap transactions for security
- Secure key management in hardware
- No private keys leave the device

### Seeker ID
- Digital passport to the Solana Mobile ecosystem
- Unique `.skr` domain for on-chain identity
- Enables seamless authentication and transactions

### Genesis Token
- Non-transferable token generated on each Seeker device
- Unlocks exclusive on-chain rewards
- Provides access to Solana Mobile ecosystem features

## Integration with Kit

### Detecting Seeker Device
```typescript
import { useWallets } from '@wallet-standard/react';

function SeekerDetection() {
  const { wallets } = useWallets();
  
  const seekerWallet = wallets.find(
    wallet => wallet.name.includes('Seeker') || wallet.name.includes('Seed Vault')
  );
  
  if (seekerWallet) {
    // Seeker device detected
    return <SeekerFeatures wallet={seekerWallet} />;
  }
  
  return <StandardWalletFeatures />;
}
```

### Accessing Seed Vault
```typescript
import { useWallets } from '@wallet-standard/react';

function SeedVaultAccess() {
  const { wallets } = useWallets();
  const seekerWallet = wallets.find(w => w.name.includes('Seed Vault'));
  
  const handleConnect = async () => {
    if (seekerWallet) {
      // Connect to Seed Vault
      await seekerWallet.features['standard:connect'].connect();
      
      // Seed Vault supports biometric authentication
      // User will be prompted for fingerprint
    }
  };
  
  return <button onClick={handleConnect}>Connect Seed Vault</button>;
}
```

### Seeker ID Integration
```typescript
import { useSolana } from '@solana/react';

function SeekerIDFeatures() {
  const { rpc } = useSolana();
  const { wallets } = useWallets();
  const seekerWallet = wallets.find(w => w.name.includes('Seeker'));
  
  const getSeekerID = async () => {
    if (seekerWallet?.publicKey) {
      // Resolve .skr domain from public key
      // Seeker ID is associated with the device's wallet
      const seekerID = await resolveSeekerID(seekerWallet.publicKey);
      return seekerID;
    }
  };
  
  return <div>Seeker ID: {seekerID}</div>;
}
```

## Mobile-Optimized UX

### Touch Interactions
- Use larger touch targets (minimum 44x44px)
- Implement swipe gestures where appropriate
- Provide haptic feedback for important actions
- Optimize for one-handed use

### Biometric Authentication
```typescript
function BiometricAuth() {
  const handleTransaction = async () => {
    // Seed Vault will prompt for fingerprint
    // This happens automatically when signing
    const signature = await wallet.features['standard:signTransaction'].signTransaction({
      message: transactionMessage,
    });
  };
  
  return <button onClick={handleTransaction}>Send (Fingerprint Required)</button>;
}
```

### Double-Tap Security
- Seeker supports double-tap confirmation for transactions
- Implement clear UI indicators for double-tap actions
- Provide visual feedback for tap confirmation
- Explain double-tap security to users

## Best Practices

### Performance
- Optimize for mobile network conditions
- Implement proper loading states
- Cache data when appropriate
- Minimize RPC calls
- Use WebSocket subscriptions efficiently

### Security
- Never request private keys
- Always use Seed Vault for signing
- Implement proper transaction validation
- Show clear transaction details before signing
- Handle biometric failures gracefully

### User Experience
- Provide clear instructions for Seeker-specific features
- Explain Seed Vault benefits
- Show Seeker ID prominently when available
- Implement proper error handling
- Provide helpful error messages

### Network Configuration
- Support both mainnet and devnet
- Allow network switching when appropriate
- Use appropriate RPC endpoints for mobile
- Consider using custom RPC for better performance

## Seeker-Specific Features

### Genesis Token Detection
```typescript
async function checkGenesisToken(publicKey: PublicKey) {
  // Check if wallet has Genesis Token
  // This indicates a Seeker device
  const tokenAccounts = await rpc.getTokenAccountsByOwner({
    owner: publicKey,
    mint: GENESIS_TOKEN_MINT,
  }).send();
  
  return tokenAccounts.value.length > 0;
}
```

### Seeker Ecosystem Integration
- Integrate with Seeker-specific programs
- Support Seeker ID resolution
- Implement Seeker reward systems
- Support Genesis Token features

## Testing on Seeker

### Device Testing
- Test on actual Seeker hardware when possible
- Test biometric authentication flows
- Test double-tap transactions
- Test network switching
- Test offline scenarios

### Emulator Testing
- Use Solana Mobile emulators when available
- Test wallet connection flows
- Test transaction signing
- Test error scenarios

## Error Handling

### Seeker-Specific Errors
```typescript
try {
  await wallet.features['standard:signTransaction'].signTransaction({
    message: transactionMessage,
  });
} catch (error) {
  if (error.message.includes('biometric')) {
    // Handle biometric authentication failure
    showError('Biometric authentication failed. Please try again.');
  } else if (error.message.includes('user_rejected')) {
    // Handle user rejection
    showError('Transaction cancelled by user.');
  } else {
    // Handle other errors
    showError('Transaction failed. Please try again.');
  }
}
```

## Resources
- [Solana Mobile Seeker](https://solanamobile.com/seeker)
- [Solana Mobile Documentation](https://docs.solanamobile.com)
- [Kit Documentation](https://solanakit.org/docs)

