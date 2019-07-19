#!/usr/bin/env node
import fetch from 'node-fetch';

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

// TODO MRB:
//  - Provision SSH keys on the machine (copying ssm-scala)
//  - Shell to ssm create-session and connect stdin as proxy
//  - Bonus extra credit
//      - SSH into tags (eg ssh aws:investigations,pfi-worker,rex)

lookupInstance(instanceId).then(({ profile, region }) => {
    console.error(`I will eventually connect to ${instanceId} in ${region} using ${profile} credentials`);
}).catch(err => {
    console.error(err);
});