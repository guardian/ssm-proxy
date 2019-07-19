#!/usr/bin/env node

const instanceId = process.argv[2];

// TODO MRB:
//  - Look up instance id in prism to get profile (account name) and region
//  - Provision SSH keys on the machine (copying ssm-scala)
//  - Shell to ssm create-session and connect stdin as proxy
//  - Bonus extra credit
//      - SSH into tags (eg ssh aws:investigations,pfi-worker,rex)

console.error("I will eventually connect to " + instanceId);