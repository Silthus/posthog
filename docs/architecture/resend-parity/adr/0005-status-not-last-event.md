# `emails.get` returns `status`, not `last_event`

Resend's email object calls its state `last_event`. Ours is `status`, because the values differ: `waiting`, `skipped`, `failed` and `unknown` are ours, and Resend's `opened` and `clicked` are events here, not statuses.
The migration skill rewrites those branches either way, and a familiar name would hide that the values changed.
