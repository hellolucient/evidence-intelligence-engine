# General Development Rules

## Code Style Guidelines

### General
- Use meaningful variable and function names
- Keep functions small and focused (single responsibility)
- Use early returns to reduce nesting
- Comment complex logic, not obvious code
- Prefer composition over inheritance

### React/Next.js
- Use functional components only
- Extract reusable logic into custom hooks
- Keep components small and focused
- Use proper key props for lists
- Avoid inline object/array creation in render
- Use React.memo for expensive components when appropriate

### TypeScript
- Use const assertions where appropriate
- Prefer type inference when types are obvious
- Export types/interfaces that are used externally
- Use enums for fixed sets of values
- Avoid type assertions unless necessary

### File Organization
- Group related files together
- Use index files for clean imports
- Keep file names descriptive and consistent
- Separate concerns (components, hooks, utils, types)
- Follow Next.js App Router conventions

## Testing Guidelines

### Unit Tests
- Test utility functions thoroughly
- Mock external dependencies
- Test edge cases and error conditions
- Aim for high code coverage on critical paths

### Integration Tests
- Test API endpoints
- Test wallet connection flows
- Test transaction handling
- Test error scenarios

### E2E Tests
- Test critical user flows
- Test wallet interactions
- Test error scenarios
- Use proper test data

## Performance Guidelines

### Frontend
- Optimize images and assets
- Implement code splitting
- Use React.memo for expensive components
- Avoid unnecessary re-renders
- Lazy load heavy components
- Use Next.js Image component
- Minimize bundle size

### Backend
- Implement proper caching strategies
- Use connection pooling for databases
- Optimize database queries
- Implement rate limiting
- Monitor and log performance metrics
- Use compression middleware

## Security Guidelines

### General
- Never commit secrets or API keys
- Validate all user input
- Sanitize data before displaying
- Use HTTPS in production
- Implement proper CORS policies
- Keep dependencies updated

### Solana-Specific
- Validate all public keys before use
- Check transaction signatures
- Implement proper error handling for wallet operations
- Never trust client-side data
- Use proper network configuration
- Handle wallet disconnections securely

## Documentation

### Code Comments
- Document complex algorithms
- Explain "why" not "what"
- Keep comments up to date
- Use JSDoc for public APIs

### README
- Keep README updated
- Include setup instructions
- Document environment variables
- Include API documentation
- Add troubleshooting section

## Git Workflow

### Commits
- Write clear, descriptive commit messages
- Use conventional commit format when possible
- Keep commits focused and atomic
- Never commit sensitive data

### Branches
- Use feature branches for new features
- Keep main/master branch stable
- Use descriptive branch names
- Delete merged branches

## Environment-Specific Configuration

### Development
- Use `.env.local` for local environment variables
- Enable detailed error messages
- Use devnet for Solana testing
- Enable hot reload
- Use development-friendly logging

### Production
- Use environment variables from hosting platform
- Minimize error details exposed to users
- Use mainnet for Solana (when ready)
- Enable production optimizations
- Implement proper monitoring and logging
- Use production-grade error handling

