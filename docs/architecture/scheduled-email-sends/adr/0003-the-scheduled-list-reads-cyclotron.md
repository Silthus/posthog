# The scheduled list reads cyclotron

`GET messaging/emails/?status=scheduled` reads never-claimed jobs from cyclotron through cdp-api, from a partial index on `(team_id, scheduled, id)`.
This map adds only that filter. Any later filter, for sent or failed emails, belongs to future or batch work, and would read ClickHouse.
The status projection would have to scan every email the team sent in the last 30 days or more to find the few still waiting. Its writes are best effort, so a lost row would hide a waiting send, and it holds no recipient.

## Consequences

One route has two backends, chosen by filter.
The partial index also holds send-now emails until a worker claims them.
