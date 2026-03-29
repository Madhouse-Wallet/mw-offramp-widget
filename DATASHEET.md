# Madhouse Wallet — Off-Ramp API Datasheet

**The Walker Ledger LLC**
Website: [https://www.madhousewallet.com](https://www.madhousewallet.com)
API Docs: [https://business.madhousewallet.com/developers/api-docs](https://business.madhousewallet.com/developers/api-docs)
API Changelog: [https://business.madhousewallet.com/developers/changelog]qui(https://business.madhousewallet.com/developers/changelog)
Support: quincy@madhousewallet.com

---

## 1. Company Overview

| | |
|---|---|
| **Company Name** | The Walker Ledger LLC (Madhouse Wallet) |
| **Headquarters** | Montana, United States |
| **Year Founded** | 2024 |
| **Contact** | Quincy, Founder — quincy@madhousewallet.com |
| **Supported Flow Types** | Off-ramp (stablecoin → fiat) |
| **Widget UI Sample** | https://sellcoins.now/ |

---

## 2. API & Integration

| | |
|---|---|
| **API Documentation** | https://business.madhousewallet.com/developers/api-docs |
| **Integration Models** | Direct API, Widget UI |
| **Fully Programmatic (no front-end required)** | Yes |
| **Versioned with Changelog** | Yes — https://business.madhousewallet.com/developers/changelog |
| **Sandbox / Staging Environment** | Yes |
| **Sub-accounts / Virtual Account Creation** | No |
| **Batch Multi-Currency Processing** | No |
| **Webhooks (status & settlement notifications)** | Planned — not yet available |
| **Developer Support** | Yes — dedicated Slack channel |

### Response Times

| Operation | Typical Latency |
|---|---|
| FX Quote | 2–3 seconds |
| Trade Execution | 3–5 minutes |
| Settlement Confirmation | 2–3 seconds |
| ACH Settlement | 0–2 business days |
| SWIFT Settlement | 5–7 business days |
| All other local rails | Instant |

### Key API Endpoints

| Method | Endpoint | Description | Rate Limit |
|---|---|---|---|
| GET | `/api/payouts/account-requirements` | Required fields for a target currency | 60 req/min |
| POST | `/api/payouts/account-requirements` | Refresh fields after a dependent field change | 60 req/min |
| GET | `/api/payouts/quote` | USD → target currency exchange quote | 20 req/min |
| POST | `/api/payouts/transfer` | Initiate a USDC payout; returns deposit address | 5 req/min |
| POST | `/api/payouts/transfer/cancel` | Cancel a pending transfer (before USDC is sent) | 20 req/min |
| GET | `/api/payouts/transfer/:id` | Get transfer status and details (DB snapshot) | 30 req/min |
| GET | `/api/payouts/transfer-status/:id` | Get transfer status with live quote and recipient details | 30 req/min |
| GET | `/api/payouts/recipients` | List recipients | 30 req/min |
| POST | `/api/payouts/recipients` | Create a payout recipient | 30 req/min |
| GET | `/api/payouts/recipients/:id` | Fetch a single recipient | 30 req/min |
| DELETE | `/api/payouts/recipients/:id` | Delete a recipient (blocked if transfer in flight) | 30 req/min |

### Transfer Flow (API Key Callers)

1. `GET /api/payouts/account-requirements` — fetch required fields for target currency
2. `POST /api/payouts/recipients` — create recipient with validated fields
3. `GET /api/payouts/quote` — get a 5-minute locked FX quote; receive `quoteId`
4. `POST /api/payouts/transfer` — submit transfer with `quoteId`; receive `escrow_wallet` (deposit address) and `expires_at`
5. Send exact USDC amount to the deposit address from `source_wallet` within the expiry window
6. The platform detects the deposit, converts funds, and routes to the recipient's bank account automatically
7. Poll `GET /api/payouts/transfer-status/:id` for live status updates

---

## 3. Compliance & Licensing

| | |
|---|---|
| **Regulatory Licenses** | FinCEN — United States (MSB) |
| **MSB / EMI / PSP Registration** | Yes — registered MSB |
| **End-User Compliance (B2B)** | Partners must KYC their own end users per our MSA |
| **Compliance Partner** | Comply Factor |
| **Partner KYB Onboarding Time** | 3–5 business days |
| **End-Customer KYC** | Performed by partner — we do not KYC partner end-customers |
| **Travel Rule** | N/A |
| **Ongoing AML / Sanctions Monitoring** | Yes |

---

## 4. Operational Performance

| | |
|---|---|
| **Off-Ramp Success Rate** | 98% |
| **Common Failure Causes** | Compliance review (delay only, max 72 hours — never a hard failure) |
| **Automatic Retry on Failure** | Yes |
| **Average Time to Resolution** | Minutes |

---

## 5. Pricing & Commercial Terms

| | |
|---|---|
| **FX Spread** | Mid-market rate |
| **Transaction Fee** | 0.3% |
| **Platform Fee** | 0.5% |
| **Settlement Fee** | Variable; typically under 1% for transactions above 500 USDC |
| **FX Quote Validity** | 5 minutes |
| **Minimum Volume Commitment** | None |
| **Enterprise / Volume Pricing** | Revenue share programs available — contact support@madhousewallet.com |

---

## 6. Currency & Market Coverage

### Off-Ramp Fiat Currencies Supported

85 currencies across Africa, Asia, Europe, Latin America, the Middle East, and Oceania. See the full table in Section 11.

### Operational Jurisdiction

- Licensed in the United States (FinCEN MSB)
- FX infrastructure is licensed in all jurisdictions where funds are off-ramped

### Maximum Transaction Size

| Tier | Limit |
|---|---|
| Default starting tier | $9,000 per transaction |
| Verified / enterprise partners | Up to $1,000,000 per transaction |

### Daily / Monthly Capacity

No per-currency cap — the underlying FX infrastructure is highly liquid.

---

## 7. Chain & Asset Support

| | |
|---|---|
| **Supported Stablecoin** | USDC |
| **Supported Blockchains** | Arbitrum, Base, Ethereum Mainnet, Optimism, Polygon, Solana |
| **Deposit Addresses** | Per-transfer (unique address per transaction) |
| **Multi-Chain Deposits** | Yes — specify the chain in the API request |
| **Stablecoin Settlement Timeframe** | 5–10 minutes after deposit confirmation |
| **Blockchain-Native AML / Travel Rule** | No |

---

## 8. Liquidity & FX

| | |
|---|---|
| **FX Spread Source** | Determined by our institutional FX infrastructure |
| **Liquidity Model** | External institutional liquidity providers |
| **Rate Refresh Frequency** | Real-time |
| **Rate Lock During Execution** | Yes — 5-minute locked quote via `GET /api/payouts/quote` |
| **Max Liquidity Per Currency Per Transaction** | $1,000,000 USD equivalent |
| **Supported Pairs** | USDC → any currency in the supported currencies table |

---

## 9. Settlement & Payout Operations

| | |
|---|---|
| **Settlement Timeframes** | Instant (most local rails); ACH 1–2 days; SWIFT 5–7 days |
| **Programmable Disbursement via API** | Yes — fully API-driven after recipient creation |
| **Settlement Currency ≠ Invoice Currency** | No |
| **Settlement Netting** | Per-transaction gross settlement |

### Transfer Status Lifecycle

| Status | Meaning |
|---|---|
| `pending` | Transfer created; awaiting USDC deposit |
| `awaiting_deposit` | Deposit address issued; waiting for USDC |
| `deposit_sent` | USDC confirmed on-chain |
| `processing` | Funds being converted and routed |
| `completed` | Funds delivered to recipient bank |
| `failed` | Error — contact support with `transfer_id` |

---

## 10. Security & Data

| | |
|---|---|
| **Cloud Infrastructure** | AWS us-east-1 |
| **Encryption at Rest** | AES-256 |
| **Encryption in Transit** | TLS 1.2+ (all API traffic); RSA for webhook verification |
| **API Response Encryption** | AES-256-GCM per-session encrypted responses for browser clients |
| **Key Management** | AWS KMS (secp256k1 signing keys never leave KMS) |
| **Certifications** | SOC 2 audit in preparation; GDPR compliant; CCPA compliant |
| **Standard Data Retention** | 90 days |
| **Custom Data Retention** | Yes — available on request |

### API Key Security Controls

- API keys use format `mw_live_<keyId>_<secret>` (128-bit entropy secret)
- Keys are stored as SHA-256 hashes — plaintext is shown once at creation and never retrievable
- Maximum 5 API keys per account
- Per-key `lastUsedAt` timestamp stamped on every authenticated request
- Optional **IP restriction**: lock API keys to a single IPv4 address (`/32`)
- Admin-enforced IP restriction available for enterprise accounts
- Rate limits are per-key (not per-user): isolated quotas per integration
- Key management endpoints require browser session JWT — an API key cannot create or revoke other API keys

### Authentication

- All API requests require `Authorization: Bearer mw_live_...` header
- Self-hosted WebAuthn passkey + ES256 JWT auth for dashboard/browser users
- No third-party auth dependencies

---

## 11. Supported Currencies

| Code | Currency | Country | Payment Methods |
|---|---|---|---|
| AED | UAE Dirham | United Arab Emirates | Local bank account |
| ARS | Argentine Peso | Argentina | Local bank account |
| ALL | Albanian Lek | Albania | SWIFT |
| AUD | Australian Dollar | Australia | Local bank account, BPAY |
| BAM | Convertible Mark | Bosnia and Herzegovina | SWIFT |
| BDT | Bangladeshi Taka | Bangladesh | Local bank account, bKash, E-Wallet |
| BHD | Bahraini Dinar | Bahrain | SWIFT |
| BMD | Bermudian Dollar | Bermuda | SWIFT |
| BOB | Bolivian Boliviano | Bolivia | SWIFT |
| BRL | Brazilian Real | Brazil | Local bank account, Brazil business |
| BWP | Botswanan Pula | Botswana | SWIFT |
| CAD | Canadian Dollar | Canada | Local bank account, Interac |
| CHF | Swiss Franc | Switzerland | IBAN |
| CLP | Chilean Peso | Chile | Local bank account |
| CNY | Chinese Yuan | China | Alipay, WeChat Pay |
| COP | Colombian Peso | Colombia | Local bank account |
| CRC | Costa Rican Colon | Costa Rica | Local bank account |
| CVE | Cape Verdean Escudo | Cape Verde | SWIFT |
| CZK | Czech Koruna | Czech Republic | Local bank account, IBAN |
| DKK | Danish Krone | Denmark | IBAN |
| DOP | Dominican Peso | Dominican Republic | SWIFT |
| EGP | Egyptian Pound | Egypt | IBAN |
| EUR | Euro | Eurozone | IBAN (inside Europe), SWIFT (outside) |
| GBP | British Pound | United Kingdom | Local bank account (sort code), IBAN, SWIFT |
| GEL | Georgian Lari | Georgia | IBAN |
| GHS | Ghanaian Cedi | Ghana | Local bank account |
| GMD | Gambian Dalasi | Gambia | SWIFT |
| GNF | Guinean Franc | Guinea | SWIFT |
| GTQ | Guatemalan Quetzal | Guatemala | SWIFT |
| HKD | Hong Kong Dollar | Hong Kong | FPS ID, Local bank account |
| HNL | Honduran Lempira | Honduras | SWIFT |
| HUF | Hungarian Forint | Hungary | Local bank account, IBAN |
| IDR | Indonesian Rupiah | Indonesia | Local bank account, E-Wallet |
| ILS | Israeli New Shekel | Israel | IBAN |
| INR | Indian Rupee | India | Local bank account, UPI |
| ISK | Icelandic Krona | Iceland | SWIFT |
| JPY | Japanese Yen | Japan | Local bank account |
| KES | Kenyan Shilling | Kenya | M-PESA, Local bank account |
| KGS | Kyrgystani Som | Kyrgyzstan | SWIFT |
| KHR | Cambodian Riel | Cambodia | SWIFT |
| KRW | South Korean Won | South Korea | PayGate (personal), PayGate (business) |
| KWD | Kuwaiti Dinar | Kuwait | SWIFT |
| LAK | Laotian Kip | Laos | SWIFT |
| LKR | Sri Lankan Rupee | Sri Lanka | Local bank account |
| MAD | Moroccan Dirham | Morocco | Local bank account |
| MNT | Mongolian Togrog | Mongolia | SWIFT |
| MOP | Macanese Pataca | Macau | SWIFT |
| MUR | Mauritian Rupee | Mauritius | SWIFT |
| MXN | Mexican Peso | Mexico | CLABE |
| MYR | Malaysian Ringgit | Malaysia | DuitNow, Local bank account |
| NAD | Namibian Dollar | Namibia | SWIFT |
| NGN | Nigerian Naira | Nigeria | Local bank account |
| NIO | Nicaraguan Cordoba | Nicaragua | SWIFT |
| NOK | Norwegian Krone | Norway | IBAN |
| NPR | Nepalese Rupee | Nepal | Local bank account |
| NZD | New Zealand Dollar | New Zealand | Local bank account |
| OMR | Omani Rial | Oman | SWIFT |
| PEN | Peruvian Sol | Peru | SWIFT |
| PHP | Philippine Peso | Philippines | Local bank account |
| PKR | Pakistani Rupee | Pakistan | IBAN |
| PLN | Polish Zloty | Poland | Local bank account, IBAN |
| PYG | Paraguayan Guarani | Paraguay | SWIFT |
| QAR | Qatari Riyal | Qatar | SWIFT |
| RON | Romanian Leu | Romania | IBAN |
| RSD | Serbian Dinar | Serbia | SWIFT |
| RWF | Rwandan Franc | Rwanda | SWIFT |
| SAR | Saudi Riyal | Saudi Arabia | SWIFT |
| SCR | Seychellois Rupee | Seychelles | SWIFT |
| SEK | Swedish Krona | Sweden | IBAN |
| SGD | Singapore Dollar | Singapore | Local bank account, PayNow |
| SRD | Surinamese Dollar | Suriname | SWIFT |
| THB | Thai Baht | Thailand | Local bank account |
| TND | Tunisian Dinar | Tunisia | SWIFT |
| TRY | Turkish Lira | Turkey | IBAN |
| TZS | Tanzanian Shilling | Tanzania | Local bank account |
| UAH | Ukrainian Hryvnia | Ukraine | IBAN, PrivatBank card |
| UGX | Ugandan Shilling | Uganda | Local bank account |
| USD | US Dollar | United States | ACH, Wire, SWIFT |
| UYU | Uruguayan Peso | Uruguay | Local bank account |
| VND | Vietnamese Dong | Vietnam | Local bank account |
| ZAR | South African Rand | South Africa | Local bank account |

> **Note**: BGN (Bulgarian Lev) is listed but currently not supported for payouts.

---

## 12. Current Client Examples

We specialize in emerging markets across Africa, Southeast Asia, and South America. Current integrations include:

- **Remote talent agencies in Kenya** — international payroll settled in KES via M-PESA and local bank accounts
- **Renewable energy businesses in Nigeria** — cross-border supplier payments settled in NGN
- **Software consulting agencies in India** — contractor payouts settled in INR via UPI and local bank accounts

All clients use USDC as the settlement stablecoin for international transfers.

---

## 13. Support

| Channel | Details |
|---|---|
| **Email** | support@madhousewallet.com |
| **Developer Support** | Dedicated Slack channel (provided at onboarding) |
| **API Docs** | https://business.madhousewallet.com/developers/api-docs |
| **Changelog** | https://business.madhousewallet.com/developers/changelog |
| **WhatsApp** | Available upon request at onboarding |

---

*Last updated: 2026-03-29*
