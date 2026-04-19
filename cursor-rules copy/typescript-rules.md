# TypeScript Best Practices

## Type Safety
- Always use strict mode (`"strict": true` in tsconfig.json)
- Define interfaces/types for all props, API responses, and data structures
- Avoid `any` - use `unknown` if type is truly unknown
- Use type guards for runtime type checking
- Prefer `interface` for object shapes, `type` for unions/intersections

## Component Props
- Always type component props with interfaces:
  ```typescript
  interface ButtonProps {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  }
  
  const Button: React.FC<ButtonProps> = ({ label, onClick, disabled }) => {
    // ...
  }
  ```

## API Types
- Create shared types for API requests/responses
- Use discriminated unions for different response types
- Type all async functions with Promise<T>
- Export types from a central `types.ts` file when shared

## Utility Types
- Use built-in utility types: `Partial<T>`, `Pick<T>`, `Omit<T>`, `Record<K, V>`
- Create custom utility types when needed
- Use `as const` for literal types
- Use `satisfies` operator for type checking without widening

## Error Handling
- Type errors explicitly
- Use Result types or discriminated unions for error handling
- Never use `catch (e)` without typing `e`
- Create custom error classes when appropriate

## Type Inference
- Let TypeScript infer types when obvious
- Use explicit types for public APIs
- Use `const` assertions for literal types
- Avoid unnecessary type annotations

## Module Organization
- Export types/interfaces that are used externally
- Use namespace for related types when appropriate
- Keep type definitions close to where they're used
- Create shared type files for common types

