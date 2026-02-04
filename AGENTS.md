# AGENTS.md

AI coding guidelines for the GitHub Webhook Sanitization Proxy.

## Overview

This is a Bun-based proxy server that sanitizes GitHub webhook payloads before forwarding them to Linear. It removes sensitive information while preserving Linear issue IDs for PR linking.

## Project Structure

```
github-webhook-proxy/
├── src/
│   ├── index.ts          # Main server entry point
│   ├── sanitize.ts       # Payload sanitization logic
│   ├── signature.ts      # HMAC signature verification/signing
│   └── config.ts         # Event whitelist and configuration
├── test/
│   └── *.test.ts         # Test files
├── package.json
├── tsconfig.json
├── README.md
├── AGENTS.md             # This file
└── PLAN.md               # Investigation report and implementation plan
```

## Coding Guidelines

### TypeScript

- Use strict TypeScript with proper types
- Prefer `const` over `let`
- Use explicit return types for exported functions
- Document exported functions with JSDoc comments

### Testing

- Write tests for all sanitization logic
- Use `bun test` for running tests
- Test files should be in `test/` directory with `.test.ts` suffix

### Error Handling

- Return 200 for filtered events (prevents GitHub retries)
- Return 401 for invalid signatures
- Return 500 for internal errors with logging
- Never expose internal error details to clients

### Security

- Never log sensitive payload content
- Validate all signatures before processing
- Use constant-time comparison for signature verification

## Key Implementation Details

### Issue ID Extraction

Linear issue IDs follow the pattern: `TEAMKEY-NUMBER` (e.g., `ENG-123`, `LIN-456`)
- Team key: 1-7 alphanumeric characters (uppercase)
- Number: 1-9 digits

### Magic Words

These keywords affect how Linear links PRs to issues:

**Closing words** (auto-close on merge):
`close`, `closes`, `closed`, `closing`, `fix`, `fixes`, `fixed`, `fixing`, `resolve`, `resolves`, `resolved`, `resolving`, `complete`, `completes`, `completed`, `completing`

**Contributing words** (link without closing):
`ref`, `refs`, `references`, `part of`, `related to`, `relates to`, `contributes to`, `towards`, `toward`

### Signature Algorithm

GitHub uses HMAC-SHA1 with the header `x-hub-signature`:
```
sha1=<hex-digest>
```

## Commands

```bash
bun install      # Install dependencies
bun run dev      # Run with watch mode
bun test         # Run tests
bun run start    # Run production server
```
