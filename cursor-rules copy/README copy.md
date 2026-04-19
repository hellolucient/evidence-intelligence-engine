# Cursor Rules Directory

This directory contains organized best practices and coding guidelines for the SolPonzi project.

## Files

- **nextjs-rules.md** - Next.js 14 App Router best practices
- **typescript-rules.md** - TypeScript coding standards and type safety guidelines
- **nodejs-rules.md** - Node.js backend development practices
- **solana-kit-rules.md** - Solana Kit SDK best practices and Wallet Standard integration
- **seeker-integration-rules.md** - Solana Seeker device and Seed Vault integration guidelines
- **twa-deployment-rules.md** - Trusted Web Activity (TWA) deployment guide for Android/Solana dApp Store
- **general-rules.md** - General development rules, code style, and project guidelines

## Usage

These rules are automatically referenced by Cursor IDE to provide context-aware suggestions and enforce best practices while coding.

The main `.cursorrules` file at the project root contains a comprehensive summary of all these rules for quick reference.

## Migration Notes

This project has migrated from the traditional Solana Wallet Adapter to Solana Kit. Key changes:
- Using `@solana/kit` and `@solana/react` instead of wallet adapter packages
- Using Wallet Standard (`@wallet-standard/react`) for wallet integration
- Seeker/Seed Vault support for Solana Mobile devices
- More modular and type-safe architecture

## Updating Rules

When updating these rules:
1. Update the specific rule file in this directory
2. Update the corresponding section in `.cursorrules` at the project root
3. Keep rules consistent across all files
4. Document any breaking changes or new patterns

