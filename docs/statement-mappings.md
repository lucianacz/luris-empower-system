# Statement mapping notes

This document records the structures observed in the user-provided samples. It contains no original rows, account numbers, customer names, merchant lists, or statement files. Test fixtures use invented values while preserving column names and formatting behavior.

## Deel balance exports

Observed files: eight monthly CSV exports covering January through August 2026. Each file has 23 columns and 6–11 rows.

| Source column | Normalized field | Treatment |
| --- | --- | --- |
| `ID` | `source_transaction_id` | Strong duplicate key |
| `Date Requested` | `occurred_at` | UTC-naive export timestamp normalized to ISO 8601 |
| `Transaction Status` | `status` | `completed` → posted; `failure` → failed and excluded |
| `Transaction Type` | `kind` | `client_payment` → income; `withdrawal` → transfer |
| `Currency` | `currency` | Transaction/balance currency |
| `Transaction Amount` | `amount` | Signed amount; client payments positive, withdrawals negative |
| `Amount Transferred` | `original_amount` | Net amount delivered to the destination |
| `Currency Transferred` | `original_currency` | Destination currency |
| fee columns | `fee_amount` | Explicit fees plus a net-transfer difference check |
| withdrawal method columns | metadata | Used as an owned-account matching hint |
| `Trace ID` | metadata | Retained for reconciliation |

The adapter recognizes completed and failed withdrawals, Deel card funding, DolarApp/ARQ withdrawals, and client payments. A withdrawal remains visible but excluded from ordinary income and spending; its fee is tracked separately.

## Deel card exports

Observed files: five overlapping CSV exports. The largest covers November 2023 through September 2026 and contains 1,203 rows. The other exports are partial ranges with the same 21-column schema; two place `exchangeRate` in a different column order.

| Source column | Normalized field | Treatment |
| --- | --- | --- |
| `externalTxId` | `source_transaction_id` | Strong duplicate key |
| `externalRootTxId` | metadata | Links related authorization/refund activity |
| `date` | `occurred_at` | ISO timestamp |
| `accountAmount` | `amount` | Signed account-currency amount |
| `accountCurrency` | `currency` | Usually USD; other account currencies are preserved |
| `originalAmount` | `original_amount` | Merchant-currency amount |
| `originalCurrency` | `original_currency` | Merchant currency |
| `exchangeFeeAccountAmount` | `fee_amount` | Exchange fee in account currency |
| merchant and MCC fields | description/metadata | Merchant label is primary; MCC data is retained |
| `status` | `status` | Approved, declined, and pending are preserved |
| `type` | `kind` | POS purchase, deposit, refund, fee, or withdrawal |

Declined and pending card transactions never affect totals. Refunds remain positive. Card deposits and withdrawals are transfer candidates.

## Payoneer activity report

Observed file: one CSV report with 315 rows and six columns.

| Source column | Normalized field | Treatment |
| --- | --- | --- |
| `Date` | `occurred_at` | `D Mon, YYYY` parsed explicitly |
| `Description` | `description` and `kind` | Card charges, ATM withdrawals, client payments, and fees recognized |
| `Amount` | `amount` | Signed USD amount |
| `Currency` | `currency` | USD in the sample |
| `Status` | `status` | Completed or canceled |
| `Transaction ID` | `source_transaction_id` | Whitespace in the header is trimmed |

ATM withdrawals are excluded until their cash use is classified. Canceled rows remain in history and do not affect totals.

## ARQ / former DolarApp statements

Observed files: monthly PDFs from January 2025 through August 2026. Pages contain a statement summary and a transaction table with `Fecha`, `Tipo`, `Monto`, `Moneda`, and `Descripción`. Several months legitimately contain no transaction rows. The PDF parser reconstructs rows by visual coordinates rather than relying on text extraction order.

| PDF column | Normalized field | Treatment |
| --- | --- | --- |
| `Fecha` | `occurred_at` | Month/day plus year from the statement period |
| `Tipo` | `kind` and metadata | QR/card payments are expenses; withdrawals are transfer candidates |
| `Monto` | `amount` | Signed ARS amount with comma grouping and decimal support |
| `Moneda` | `currency` | ARS in the supplied statements |
| `Descripción` | `description` | DolarApp Mexico receipts are recognized as internal funding |

Incoming `Recargas` that are not clearly owned-account transfers are placed in Questions rather than counted as income. This avoids overstating income when reimbursements or person-to-person movements are ambiguous.

## Brubank statements

Observed files: a 10-page 2025 PDF and a four-page January–August 2026 PDF. The movement table contains `Fecha`, `#Ref`, `Descripción`, `Débito`, `Crédito`, and `Saldo`.

| PDF column | Normalized field | Treatment |
| --- | --- | --- |
| `Fecha` | `occurred_at` | `DD-MM-YY` normalized to ISO 8601 |
| `#Ref` | `source_transaction_id` | Strong duplicate key |
| `Descripción` | `description` | Preserved for categorization and transfer hints |
| `Débito` | negative `amount` | Consumer expense unless matched as an owned-account transfer |
| `Crédito` | positive `amount` | Kept unresolved until income/transfer status is known |
| `Saldo` | metadata | Running balance retained for reconciliation |

The parser supports Argentine number formatting such as `1.234,56`. Positive credits are deliberately conservative: they do not count as income until confirmed or matched.

## Alpaca investment statement

Observed file: a nine-page August 2026 PDF with cash summary, holdings, trades, income, and gain/loss sections. It is detected as an investment statement and excluded from the expense importer. The database already supports investment accounts, assets, trades, positions, and portfolio snapshots. Automated Alpaca/ARQ investment parsing remains a later-phase task so investment purchases cannot be mistaken for consumer spending.

## Duplicate and transfer rules

- Exact file checksums prevent the same statement from creating a second import batch.
- Provider transaction IDs are the preferred transaction key.
- A stable fingerprint over provider, date, description, amount, and currency covers rows without strong IDs and overlapping statements.
- Transfer matching compares opposing signed movements across different owned accounts.
- Matching permits a two-day lead and ten-day posting delay, same-currency tolerances, source/destination original amounts, explicit fees, partial allocations, one-to-many, and many-to-one matches.
- Connected transfer matches are grouped into chains when the receiving account later sends some or all of the funds onward.
- Failed, pending, reversed, investment, cash-withdrawal, unknown, and internal-transfer rows are excluded from ordinary income and spending totals.
