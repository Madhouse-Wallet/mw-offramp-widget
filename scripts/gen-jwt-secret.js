#!/usr/bin/env node
// Generates a cryptographically secure 32-byte hex secret for WIDGET_JWT_SECRET
const secret = require('crypto').randomBytes(32).toString('hex')
console.log(`WIDGET_JWT_SECRET=${secret}`)
