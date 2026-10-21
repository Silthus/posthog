# A library send names one key

A send of a library template names it inside `libraryTemplate('welcome', data)`, and that key is the mail key. Only a code send carries a top-level `key`, because code content has no name of its own.
We rejected a separate mail key beside the library key. Each library template owns one workflow and every edit writes a new version with its own metrics (`transactional_email_workflows.py:1-3`), so two keys would split one email's history across workflows and could disagree.
Swapping `welcome` for `welcome-v2` in code is then honestly a new email kind. Editing `welcome` in PostHog keeps its history.
