#!/usr/bin/env node

import AWS from 'aws-sdk';
import fetch from 'node-fetch';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { spawn } from 'child_process';

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

async function runScript(client: AWS.SSM, instanceId: string, script: string): Promise<void> {
    await client.sendCommand({
        DocumentName: "AWS-RunShellScript",
        InstanceIds: [instanceId],
        // TODO MRB: comment indicating user that ran the command (copying ssm-scala)
        Parameters: {
            "commands": [script]
        }
    }).promise();
}

async function uploadPublicKey(instanceId: string, publicKey: string, user: string, region: string, profile: string): Promise<void> {
    const client = new AWS.SSM({ region, credentials: new AWS.SharedIniFileCredentials({ profile })});

    await runScript(client, instanceId, `
        /bin/mkdir -p /home/${user}/.ssh;
        /bin/echo '${publicKey}' >> /home/${user}/.ssh/authorized_keys;
        /bin/chown ${user} /home/${user}/.ssh/authorized_keys;
        /bin/chmod 0600 /home/${user}/.ssh/authorized_keys;
    `);

    await runScript(client, instanceId, `
        /bin/sleep 30;
        /bin/echo '' > /home/${user}/.ssh/authorized_keys;
    `);
}

// TODO MRB:
//  - Security
//      - Can we generate keys and have SSH use them like the -i option
//      - Download and insert host private keys into KnownHosts
//      - Add tainted to motd
//  - Bonus extra credit
//      - SSH into tags (eg ssh aws:investigations,pfi-worker,rex)

lookupInstance(instanceId).then(async ({ profile, region }) => {
    console.error(`I will eventually connect to ${instanceId} in ${region} using ${profile} credentials`);
    
    const publicKey = readFileSync(homedir() + "/.ssh/id_rsa.pub", { encoding: "utf-8" });

    // TODO MRB: how would we know if it's a different user and what user it is?
    await uploadPublicKey(instanceId, publicKey, "ubuntu", region, profile);

    const command = `aws ssm start-session --target ${instanceId} --document-name AWS-StartSSHSession --parameters portNumber=22 --region ${region} --profile ${profile}`;
    spawn(command, { stdio: 'inherit', shell: true });
}).catch(err => {
    console.error(err);
});