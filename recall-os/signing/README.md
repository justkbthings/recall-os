# Recall OS signature verification

Recall OS releases are signed by **Karabo Goodwill Nkambule**.

## Public certificate

- File: `RecallOS-Public-Certificate.cer`
- Subject: `CN=Karabo Goodwill Nkambule`
- SHA-1 thumbprint: `C86C58F3D95FBF84260D034718E21EC775FF44D0`
- Valid until: 21 July 2029

The public certificate does not contain the private signing key. The private key
must never be committed, shared, or exported without strong password protection.

## Trusting the certificate on another Windows computer

Before installing Recall OS, compare the certificate thumbprint with the value
above using the certificate's Windows Properties dialog. Import the certificate
for the current user into both:

1. **Trusted Root Certification Authorities**
2. **Trusted Publishers**

Only trust the certificate when it was received directly from Karabo Goodwill
Nkambule through a channel you recognise. A self-signed certificate provides
tamper detection and a consistent publisher identity, but it is not independent
identity verification by a public certificate authority.

