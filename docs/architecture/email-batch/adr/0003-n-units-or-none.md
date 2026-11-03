# A batch of N takes N throttle units, or none

The batch action declares no DRF throttles.
After the shape check, the view calls `take_units` in `posthog/rate_limit.py`, which takes N units from each of the four send throttles (per key and per team, burst and sustained) or from none.
A batch that would cross a limit answers `429` as a whole, with `Retry-After`.
We chose this so that the send rate means emails, not requests, and so that a batch can't use up part of the limit and then fail.

## Considered options

- **DRF's request-counting throttles.** They run in `initial()`, before the body is read, so they can't know N.
  A batch of 100 would count as one send.
- **A weighted throttle inside messaging.** It would copy the on/off switch, the team bypass and the fail-open rule from `_allow_request_internal`, and the copy would drift.

## Consequences

- A malformed batch takes no units, because the shape check runs first.
  An email that fails later, or a replay, still costs its unit, as on the single send.
- Two processes can race between the cache read and write, as they can with `allow_request` today.
