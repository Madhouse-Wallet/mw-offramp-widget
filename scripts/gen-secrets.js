#!/usr/bin/env node
// Generates cryptographically secure secrets for .env
const { randomBytes } = require('crypto')

const jwtSecret = randomBytes(32).toString('hex')
const encryptSecret = randomBytes(32).toString('hex')

console.log(`WIDGET_JWT_SECRET=${jwtSecret}`)
console.log(`WIDGET_ENCRYPT_SECRET=${encryptSecret}`)
