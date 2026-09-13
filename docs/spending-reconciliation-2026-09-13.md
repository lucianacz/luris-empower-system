# Spending reconciliation: September 13, 2026

This document separates the example total previously visible in the app from the read-only audit of the supplied statements. No original statement or private transaction description is stored in this repository.

## The visible USD 11,824.42

The existing USD 11,824.42 was an example-workspace summary, not a result loaded from Supabase. It covered March 1 through August 31, 2026. It is now generated from and tested against 46 individual example transactions, including the fee on an internal transfer, so every dashboard value opens the exact rows that support it.

| Month | USD cash spending |
| --- | ---: |
| March 2026 | 1,640.00 |
| April 2026 | 1,812.00 |
| May 2026 | 1,728.00 |
| June 2026 | 2,054.00 |
| July 2026 | 2,406.00 |
| August 2026 | 2,184.42 |
| **Total** | **11,824.42** |

The same 46 example transactions reconcile by category:

| Category | USD |
| --- | ---: |
| Housing | 4,680.00 |
| Groceries | 2,500.00 |
| Dining out | 1,300.00 |
| Transport | 1,050.00 |
| Travel, including flights | 700.00 |
| Health insurance | 600.00 |
| Uncategorized | 564.67 |
| Subscriptions and software | 420.00 |
| Bank fees | 9.75 |
| **Total** | **11,824.42** |

The former average of USD 1,970.74 divided this total by the six active example months. The new year-to-date default uses January 1 through September 13 and averages only the eight completed calendar months from January through August, including January and February as zero-activity months. That produces USD 1,478.05 per completed month. September is shown separately as a partial month.

## Read-only audit of the supplied statements

All 37 supplied files were parsed through the production adapters, de-duplicated by provider transaction ID or normalized fingerprint, and audited without copying the originals or writing their transactions to the repository.

For posted, USD-denominated cash spending from January 1 through September 13, 2026, the files currently produce **USD 30,816.68 across 492 transactions**:

| Month | USD cash spending |
| --- | ---: |
| January 2026 | 3,676.52 |
| February 2026 | 4,125.69 |
| March 2026 | 10,986.76 |
| April 2026 | 1,479.04 |
| May 2026 | 2,810.72 |
| June 2026 | 1,929.31 |
| July 2026 | 2,574.61 |
| August 2026 | 2,428.44 |
| September 1–13, 2026 | 805.59 |
| **Year to date** | **30,816.68** |

The March 1 through September 13 subset is USD 23,014.47 across 367 transactions. It does not support USD 11,824.42 as a real-file total.

The current automatic category suggestions for the USD audit are preliminary and intentionally leave ambiguous merchants unresolved:

| Suggested category | USD |
| --- | ---: |
| Uncategorized | 8,080.32 |
| Shopping | 5,479.16 |
| Dining out | 5,452.56 |
| Travel | 4,329.90 |
| Flights | 1,692.86 |
| Health insurance | 1,022.08 |
| Entertainment | 1,003.33 |
| Transport | 913.24 |
| Health | 752.76 |
| Subscriptions and software | 701.40 |
| Bills and utilities | 653.07 |
| Groceries | 475.47 |
| Education | 106.14 |
| Bank fees | 154.39 |
| **Total** | **30,816.68** |

This is not yet an all-currency cost-of-living total. Twenty-one 2026 transactions in non-USD currencies remain visible but are excluded from USD totals until a historical rate and methodology are confirmed. The app stores the rate date, source, methodology, and estimated flag and never substitutes today's rate.

## Import correction found during reconciliation

In the Deel balance adapter, a blank `Amount Transferred` cell parsed as zero and was incorrectly considered positive when calculating a transfer fee. This could turn an internal card-funding movement into a full-value fee. The adapter now requires the transferred value to be greater than zero before calculating that fee. An anonymized regression fixture protects this behavior.

## Transaction-level evidence

Every report result carries the exact transaction IDs used to calculate it. Dashboard totals, months, category bars, location comparisons, recurring-expense values, merchant cards, and insights open the filtered transaction ledger. The ledger then shows the original currency, USD value, rate source, account, merchant, category, location, service month, split, and source transaction ID.

The real files have passed preview and audit, but cannot be persisted from this checkout until Supabase environment values are configured and a user is signed in. This preserves any existing remote data and avoids pretending that a local demo response is the imported database.
