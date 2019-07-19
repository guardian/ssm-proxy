ssm-proxy
=========

Intermediate between ssh (via `ProxyCommand`) and AWS `ssm start-session` using the `AWS-StartSSHSession` document.
Handles provisioning temporary SSH keypair to initiate the session, following the model used in [ssm-scala](https://github.com/guardian/ssm-scala).

In practice this means you can run:

```
ssh i-0123ade411
```

and it will magically connect you, providing you have AWS credentials for the correct Janus profile.

Required SSH configuration (`~/.ssh/config`):

```
host i-* mi-*
    ProxyCommand sh -c "ssm-proxy %h"
```