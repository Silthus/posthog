# The schedule cap counts from creation

`scheduled_at` may be at most 30 days after the message was created, at accept and at every reschedule.
The status read accepts message ids up to 60 days old, and the `email_status` TTL is 61 days on `created_at`.
The status rows carry no `scheduled_at` column.
Counting from creation keeps every row of a message in one partition and every email readable at least 30 days after its requested time, with no column that every later writer would have to copy.

## Considered options

- **A cap of 30 days from each reschedule.** Repeated reschedules could push a send past the TTL. Keeping it needs the TTL and the read gate to count from the send time, which needs `scheduled_at` on every row. That includes provider events, which arrive after the job may be gone.
- **A `scheduled_at` column on the waiting rows only.** A replay writes the `scheduled` row again and would bring back the first time after a reschedule.

## Consequences

A caller who needs a later time cancels and sends again.
A reschedule to now or earlier always succeeds, so a send still waiting past its cap can go out now.
`GET emails/{id}` shows `scheduled` without the time; the list shows it.
Send-now emails stay readable for 60 days instead of 30.
Raising the cap later must raise the read gate and the TTL by the same amount.
