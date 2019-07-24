#!/usr/bin/env node

import AWS from 'aws-sdk';
import fetch from 'node-fetch';
import { writeFileSync, chmodSync } from 'fs';
import { spawn } from 'child_process';
import { generateKeyPairSync } from 'crypto';
import sshpk from 'sshpk';

const instanceId = process.argv[2];

async function lookupInstance(instanceId: string): Promise<{ region: string, profile: string }> {
    const { data } = await fetch("https://prism.gutools.co.uk/instances?instanceName=" + instanceId).then(r => r.json());

    if(!data.instances || data.instances.length === 0) {
        return Promise.reject("instanceId does not exist");
    }

    const profile  = data.instances[0].meta.origin.accountName;
    const region = data.instances[0].region;

    return { region, profile };
}

async function runScript(client: AWS.SSM, instanceId: string, user: String, script: string): Promise<string> {
    const request = {
        DocumentName: "AWS-RunShellScript",
        InstanceIds: [instanceId],
        Comment: `Command submitted by ${user}`,
        Parameters: {
            "commands": [script]
        }
    }

    const result = await client.sendCommand(request).promise();
    return result.Command!.CommandId!;
}

async function getScriptOutput(CommandId: string, InstanceId: string, client: AWS.SSM): Promise<string> {
    return new Promise((resolve, reject) => {
        async function _getOutput(retries: number) {
            const result = await client.getCommandInvocation({ CommandId, InstanceId }).promise();
            
            if(result.Status === "Success" || result.Status === "Failure") {
                resolve(result.StandardOutputContent);
            } else if(retries < 60) {
                setTimeout(() => _getOutput(retries + 1), 500);
            } else {
                reject(new Error("Unable to get script output. Timeout"));
            }
        }

        _getOutput(0);
    });
}

function generateKeyPair(): { publicKey: string, privateKey: string} {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", {
        // TODO MRB: I think this is 2048 in ssm-scala. Deliberate choice I should copy?
        // https://github.com/guardian/ssm-scala/blob/master/src/main/scala/com/gu/ssm/utils/KeyMaker.scala#L28
        modulusLength: 4096,
        publicKeyEncoding: {
            type: "spki",
            format: "pem"
        },
        privateKeyEncoding: {
            type: "pkcs8",
            format: "pem",
            // TODO MRB: I think I'm OK to go with the default cipher here?
        }
    });

    return {
        publicKey: sshpk.parseKey(publicKey, "pem").toString("ssh"),
        privateKey
    }
}

async function provisionInstance(instanceId: string, publicKey: string, loginUser: string, ssmUser: string, client: AWS.SSM): Promise<string> {
    const commandId = await runScript(client, instanceId, ssmUser, `
        /bin/mkdir -p /home/${loginUser}/.ssh;
        /bin/echo '${publicKey}' >> /home/${loginUser}/.ssh/authorized_keys;
        /bin/chown ${loginUser} /home/${loginUser}/.ssh/authorized_keys;
        /bin/chmod 0600 /home/${loginUser}/.ssh/authorized_keys;
        /usr/bin/test -d /etc/update-motd.d/ &&
        ( /usr/bin/test -f /etc/update-motd.d/99-tainted || /bin/echo -e '#!/bin/bash' | /usr/bin/sudo /usr/bin/tee -a /etc/update-motd.d/99-tainted >> /dev/null;
        /bin/echo -e 'echo -e "\\033[0;31mThis instance should be considered tainted.\\033[0;39m"' | /usr/bin/sudo /usr/bin/tee -a /etc/update-motd.d/99-tainted >> /dev/null;
        /bin/echo -e 'echo -e "\\033[0;31mIt was accessed by ${ssmUser} at ${new Date().toISOString()}\\033[0;39m"' | /usr/bin/sudo /usr/bin/tee -a /etc/update-motd.d/99-tainted >> /dev/null;
        /usr/bin/sudo /bin/chmod 0755 /etc/update-motd.d/99-tainted;
        /usr/bin/sudo /bin/run-parts /etc/update-motd.d/ | /usr/bin/sudo /usr/bin/tee /run/motd.dynamic >> /dev/null;
        )
        for hostkey in $(sshd -T 2> /dev/null |grep "^hostkey " | cut -d ' ' -f 2); do cat $hostkey.pub; done
    `);

    await runScript(client, instanceId, ssmUser, `
        /bin/sleep 30;
        /bin/echo '' > /home/${loginUser}/.ssh/authorized_keys;
    `);

    return commandId;
}

// TODO MRB:
//  - Security
//      - Use sed to only remove the key we uploaded
//  - Bonus extra credit
//      - SSH into tags (eg ssh aws:investigations,pfi-worker,rex)

lookupInstance(instanceId).then(async ({ profile, region }) => {
    const credentials = new AWS.SharedIniFileCredentials({ profile });
    const ssmClient = new AWS.SSM({ region, credentials });
    const stsClient = new AWS.STS({ region, credentials });

    const user = (await stsClient.getCallerIdentity().promise()).UserId!;

    const { publicKey, privateKey } = generateKeyPair();

    // TODO MRB: how would we know if it's a different user and what user it is?
    const commandId = await provisionInstance(instanceId, publicKey, "ubuntu", user, ssmClient);

    writeFileSync("/tmp/ssm-proxy-identity", privateKey, { encoding: "utf-8" });
    chmodSync("/tmp/ssm-proxy-identity", 0o600);

    const commandOutput = (await getScriptOutput(commandId, instanceId, ssmClient)).split("\n");
    const knownHostsFile = commandOutput.map(line => `${instanceId} ${line}`).join("\n");

    writeFileSync("/tmp/ssm-proxy-known-hosts", knownHostsFile, { encoding: "utf-8" });

    const command = `aws ssm start-session --target ${instanceId} --document-name AWS-StartSSHSession --parameters portNumber=22 --region ${region} --profile ${profile}`;
    spawn(command, { stdio: 'inherit', shell: true });
}).catch(err => {
    console.error(err);
});