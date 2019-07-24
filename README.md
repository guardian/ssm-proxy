ssm-proxy
=========

Intermediate between ssh (via `ProxyCommand`) and AWS `ssm start-session` using the `AWS-StartSSHSession` document. Uploads your `id_rsa.pub` to the instance and then ensures it is deleted after 30 seconds, following the model from [ssm-scala](https://github.com/guardian/ssm-scala).

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
