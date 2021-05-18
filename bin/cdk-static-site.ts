#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { CdkStaticSiteStack } from '../lib/cdk-static-site-stack';

const app = new cdk.App();
new CdkStaticSiteStack(app, 'CdkStaticSiteStack', {
  domainName: 'mptaws.dev',
  siteSubDomain: 'mydemo',
  env: {
    region: 'us-east-1',
    account: '934829527856'
  }
});
