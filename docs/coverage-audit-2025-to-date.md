# Statement coverage audit: 2025 to September 13, 2026

This audit covers the 37 files supplied for the project: 14 CSV exports and 23 PDF statements. Every file was read through the same production adapter used by the import preview. The original files were not modified or copied into the repository.

## Result

Day-to-day spending activity is represented for every month from January 2025 through the current partial month, September 2026. Account-statement coverage is not equally complete: the main missing history is the set of monthly Deel balance statements for 2025.

| Source | Files and coverage supplied | Missing or still needed |
| --- | --- | --- |
| Deel card spending | Five overlapping exports, including one complete export with transactions through September 13, 2026 | No missing spending month detected from January 2025 through today |
| Deel balance, income, and withdrawals | Monthly CSV exports for January through August 2026 | All monthly exports from January through December 2025; September 2026 when the current month is ready |
| ARQ | One statement for every month from January 2025 through August 2026 | September 2026 when the current statement is ready |
| Brubank | One 2025 statement and one January–August 2026 statement | September 2026 when the current statement is ready |
| Payoneer | One activity export containing transactions from January 2, 2025 through August 17, 2026 | A refreshed export through today would confirm whether there was activity after August 17; months without rows in a range export are not automatically considered missing |
| Alpaca investments | August 2026 statement only | Earlier investment statements, if the account was active before August; September 2026 when ready |

Several ARQ statements in 2025 contain zero transactions. They are valid statements and count as confirmed no-activity months, not gaps.

An additional Brubank PDF with `(1)` in its filename was found next to the supplied files. It is byte-for-byte identical to the supplied January–August 2026 statement and should be skipped by the checksum guard.

## Persistence status

All supplied files passed parsing and preview validation. They have not been persisted because this checkout does not yet have a Supabase project URL or publishable key configured. Once Supabase is connected and the user is signed in, the import screen accepts all files in one drop, previews them in sequence, stores each original in private Storage, and imports only non-duplicate transactions.

## Spending interpretation

- Purchases, bills, fees, and taxes contribute to spending.
- Refunds reduce spending.
- Transfers stay visible but do not contribute to spending totals; transfer fees still do.
- Spending remains separated by currency until a real exchange rate is available.
- Person-to-person payments and ambiguous descriptions remain uncategorized until reviewed rather than being guessed.
- Choosing a category for a merchant applies it to matching historical transactions and saves the rule for future imports.
