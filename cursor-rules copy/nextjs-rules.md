# Next.js 14 Best Practices (App Router)

## File Structure
- Use the App Router structure (`app/` directory)
- Place components in `app/components/` or a shared `components/` directory
- Use `layout.tsx` for shared layouts
- Use `page.tsx` for route pages
- Use `loading.tsx` for loading states
- Use `error.tsx` for error boundaries
- Use `not-found.tsx` for 404 pages

## Server vs Client Components
- Default to Server Components (no 'use client' directive)
- Only use 'use client' when needed for:
  - Interactive features (onClick, useState, useEffect)
  - Browser-only APIs (window, localStorage)
  - Event listeners
  - React hooks (useState, useEffect, useContext, etc.)

## Data Fetching
- Use async Server Components for data fetching
- Use Server Actions for mutations (form submissions, etc.)
- Prefer Server Components over Client Components when possible
- Use `fetch` with Next.js caching strategies:
  ```typescript
  const data = await fetch(url, { 
    next: { revalidate: 60 } // ISR with 60s revalidation
  })
  ```

## API Routes (Route Handlers)
- Use Route Handlers in `app/api/` directory
- Export named functions: GET, POST, PUT, DELETE, etc.
- Always validate and sanitize input
- Return proper HTTP status codes
- Use TypeScript types for request/response

## Performance
- Use `next/image` for images (never `<img>`)
- Use `next/link` for client-side navigation
- Implement proper loading states
- Use dynamic imports for code splitting:
  ```typescript
  const Component = dynamic(() => import('./Component'), { ssr: false })
  ```
- Optimize fonts with `next/font`

## Environment Variables
- Use `NEXT_PUBLIC_` prefix for client-side variables
- Access via `process.env.NEXT_PUBLIC_*`
- Never expose sensitive data to the client
- Use `.env.local` for local development

## Metadata and SEO
- Use metadata API for page metadata
- Export `metadata` object or `generateMetadata` function
- Use proper Open Graph and Twitter Card metadata

## Error Handling
- Use error.tsx for route-level error boundaries
- Use try/catch in Server Components and Route Handlers
- Provide user-friendly error messages
- Log errors appropriately

