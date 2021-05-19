import * as cdk from '@aws-cdk/core';
import * as r53 from '@aws-cdk/aws-route53';
import * as s3 from '@aws-cdk/aws-s3';
import * as s3d from '@aws-cdk/aws-s3-deployment';
import * as acm from '@aws-cdk/aws-certificatemanager';
import * as targets  from '@aws-cdk/aws-route53-targets';
import * as cloudfront from '@aws-cdk/aws-cloudfront';
import * as iam from '@aws-cdk/aws-iam';


export interface StaticSiteProps extends cdk.StackProps {
  domainName: string;
  siteSubDomain: string;
}

export class CdkStaticSiteStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: StaticSiteProps) {
    super(scope, id, props);

    const zone = r53.HostedZone.fromLookup(this, 'Zone', { domainName: props.domainName });
    const siteDomain = props.siteSubDomain + '.' + props.domainName;
    new cdk.CfnOutput(this, 'Site', { value: 'https://' + siteDomain});

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: siteDomain,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'error.html',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true //removes non-empty bucket during stack destruction
    })
    new cdk.CfnOutput(this, 'Bucket', { value: siteBucket.bucketName });

    const cloudfrontOAI = new cloudfront.OriginAccessIdentity(this, 'cdn-OAI', {
      comment: `OAI for ${id}`
    });

    siteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        resources: [
          siteBucket.arnForObjects("*"),
          siteBucket.bucketArn
        ],
        actions: [
          's3:List*',
          's3:Get*'
        ],
        principals: [ new iam.CanonicalUserPrincipal(cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId) ]
      })
    )
    const certificate = new acm.DnsValidatedCertificate(this, 'SiteCert', {
      domainName: siteDomain,
      hostedZone: zone,
      region: 'us-east-1',
    })
    new cdk.CfnOutput(this, 'Cert', { value:  certificate.certificateArn });

    const distribution = new cloudfront.CloudFrontWebDistribution(this, 'SiteDistribution', {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: siteBucket,
            originAccessIdentity: cloudfrontOAI
          },
          behaviors: [
            {
              isDefaultBehavior: true,
              allowedMethods: cloudfront.CloudFrontAllowedMethods.GET_HEAD_OPTIONS,
              compress: true
            }
          ]
        }
      ],
      viewerCertificate: cloudfront.ViewerCertificate.fromAcmCertificate(certificate, {
        sslMethod: cloudfront.SSLMethod.SNI,
        securityPolicy: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2019,
        aliases: [siteDomain]
      })
    });
    new cdk.CfnOutput(this, 'Distribution', { value: distribution.distributionId });

    new r53.ARecord(this, 'SiteAliasRecord', {
      recordName: siteDomain,
      target: r53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      zone
    })

    new s3d.BucketDeployment(this, 'DeployWithInvalidation', {
      sources: [ s3d.Source.asset('./assets/static-site'), ],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

  }
}
