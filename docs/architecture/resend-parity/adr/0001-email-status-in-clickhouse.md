# Email status lives in a ClickHouse table

`GET emails/{id}` reads one narrow ClickHouse table on the AUX cluster, built the way `hog_invocation_results` is: a Kafka topic, a Kafka engine table, a materialized view and a `ReplicatedReplacingMergeTree(version)` with a 30-day TTL.
We chose it over a Postgres table beside `cyclotron_jobs` and over a Kafka log projected into Valkey.
Per-message state at transactional and later marketing volume does not belong in the queue database, which is ephemeral by design. Kafka here is transport only, with short retention, so it cannot be the record.

## Consequences

- The table orders by `(team_id, message_id)`, not the function-first key of `hog_invocation_results`, because every read is a point lookup by message id.
- Rows arrive after a delay, so a `GET` right after a send returns `404 not_found`, and the docs say so.
- The version is the status rank times 2^48 plus the time in ms, so a late `sent` never replaces `delivered`.
- Point-read latency on production data is an owed proof.
