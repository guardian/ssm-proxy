ssm-proxy
=========

Intermediate between ssh (via `ProxyCommand`) and AWS `ssm start-session` using the `AWS-StartSSHSession` document. Generates and uploads temporary keys that are deleted after 30 seconds, following the model from [ssm-scala](https://github.com/guardian/ssm-scala).

Does not require bastion hosts as SSH connections are [tunnelled through AWS Systems Manager](https://aws.amazon.com/about-aws/whats-new/2019/07/session-manager-launches-tunneling-support-for-ssh-and-scp/). In practice this means you can run:

```
ssh ubuntu@i-0123ade411
```

and it will magically connect you, providing you have AWS credentials for the correct Janus profile.

It's ultimately a tunnel for vanilla SSH/SCP so all additional options (port forwarding etc) are supported.

Installation
------------

Requires node v10 or greater. With nvm: `nvm alias default 10`.

```
npm install -g @guardian/ssm-proxy
```

Requires the [AWS Session Manager Plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html).

There is a [homebrew tap](https://github.com/dkanejs/homebrew-aws-session-manager-plugin) for Mac users:

```
brew tap dkanejs/aws-session-manager-plugin
brew install aws-session-manager-plugin
```

Required SSH configuration (`~/.ssh/config`):

```
host i-* mi-*
    ProxyCommand sh -c "ssm-proxy %h"
    IdentityFile /tmp/ssm-proxy-identity
    UserKnownHostsFile /tmp/ssm-proxy-known-hosts
    StrictHostKeyChecking yes
```

The AWS Agent on your instances must be [at least v2.3.672.0](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-getting-started-enable-ssh-connections.html).
Unfortunately this is not yet the stable version in the snap repository used when we build our Ubuntu AMIs. You can easily update though in your launch configurations:

```bash
sudo snap refresh amazon-ssm-agent --channel=candidate
```

As with all good things in life, a series of cryptic IAM actions are also required:

```yaml
- Effect: Allow
  Resource: "*"
  Action:
    - ec2messages:AcknowledgeMessage
    - ec2messages:DeleteMessage
    - ec2messages:FailMessage
    - ec2messages:GetEndpoint
    - ec2messages:GetMessages
    - ec2messages:SendReply
    - ssm:UpdateInstanceInformation
    - ssm:ListInstanceAssociations
    - ssm:DescribeInstanceProperties
    - ssm:DescribeDocumentParameters
    - ssmmessages:CreateControlChannel
    - ssmmessages:CreateDataChannel
    - ssmmessages:OpenControlChannel
    - ssmmessages:OpenDataChannel
```

Note that the `ssmmessages:` actions are in addition to the actions already required for [ssm-scala](https://github.com/guardian/ssm-scala).

Running in dev
--------------

Set up as above, then:

```bash
# Do a build
npm run build

# Link once to make the build available on your PATH
npm link

npm run build && ssh ubuntu@i-<AWS Instance Id>
```

Roadmap
-------

- Add support for tags as well as instanceIds
