Test-only self-signed certificate for `test.local`.

Used by `imap-tls.test.ts` to prove that:

- a connection to a host/alias can still be verified against the certificate's
  own name (`servername`), and
- a wrong name or an untrusted chain is rejected.

It is not a secret and not used anywhere outside the test suite.
