# Status ranks for scheduled and canceled

`scheduled` takes rank 0, beside `queued`, and `canceled` takes rank 1, beside a run failure.
The rank is the high part of the status row's `version`, so a higher rank always wins whatever order rows arrive in, and a rank already written can never change.
These are the only free spots that keep `scheduled` below every other status and `canceled` below `sent`. A replayed `scheduled` row then can't hide a cancel, and a rerun that sends or fails still moves the status on.
