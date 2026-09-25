| Check | Result | Detail |
| --- | --- | --- |
| workflows summaries: follows next, every row once, no heavy fields | pass | 62 pages, 123 rows, 123 unique, count 123, leaked keys none |
| templates summaries: follows next, every row once, no heavy fields | pass | 2 pages, 4 rows, 4 unique, count 4, leaked keys none |
| gzip on workflows summaries | pass | HTTP 200, Content-Encoding gzip |
| gzip on templates summaries | pass | HTTP 200, Content-Encoding gzip |
| no gzip on plain hog_flows list | pass | HTTP 200, Content-Encoding None |
| filter status=active,draft | pass | 122 rows, expected 122 |
| filter exclude_type=loop | pass | 122 rows, expected 122 of 123 |
| filter channel=email | pass | 10 rows, expected 10 |
| filter trigger_type=event | pass | 118 rows, expected 118 |
| created_by=, returns 400 | pass | HTTP 400: {"type": "validation_error", "code": "invalid_input", "detail": "Must be a valid user uuid", "attr": "created_by"} |
| last_7_days present on every row | pass | 7 rows with totals, 116 with 0/0, 0 null |
| hog_flow:read-only key can call both summaries endpoints | pass | every request above used a key scoped to hog_flow:read only |
